use sqlx::postgres::{PgPool, PgRow};
use sqlx::{Column, Row, TypeInfo, ValueRef};
use serde::Serialize;
use serde_json::{json, Value, Map};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::error::{AppError, Result};

#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Map<String, Value>>,
    pub affected_rows: u64,
    pub execution_time_ms: u64,
}

pub struct QueryRegistry {
    active_pids: Arc<Mutex<HashMap<String, u32>>>,
}

impl QueryRegistry {
    pub fn new() -> Self {
        Self {
            active_pids: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register(&self, conn_id: &str, pid: u32) {
        let mut pids = self.active_pids.lock().await;
        pids.insert(conn_id.to_string(), pid);
    }

    pub async fn unregister(&self, conn_id: &str) {
        let mut pids = self.active_pids.lock().await;
        pids.remove(conn_id);
    }

    pub async fn cancel(&self, pool: &PgPool, conn_id: &str) -> Result<bool> {
        let pid = {
            let pids = self.active_pids.lock().await;
            pids.get(conn_id).cloned()
        };

        if let Some(pid) = pid {
            sqlx::query("SELECT pg_cancel_backend($1)")
                .bind(pid as i32)
                .execute(pool)
                .await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

pub fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

pub fn pg_row_to_json(row: &PgRow) -> Result<Map<String, Value>> {
    let mut map = Map::new();
    for col in row.columns() {
        let name = col.name();
        let val = row.try_get_raw(name).map_err(|e| AppError::Database(e))?;
        
        let json_val = if val.is_null() {
            Value::Null
        } else {
            let type_name = col.type_info().name();
            match type_name {
                "BOOL" | "bool" => {
                    let v: bool = row.get(name);
                    Value::Bool(v)
                }
                "INT2" | "int2" | "SMALLINT" | "smallint" => {
                    let v: i16 = row.get(name);
                    Value::Number(v.into())
                }
                "INT4" | "int4" | "INTEGER" | "integer" => {
                    let v: i32 = row.get(name);
                    Value::Number(v.into())
                }
                "INT8" | "int8" | "BIGINT" | "bigint" => {
                    let v: i64 = row.get(name);
                    Value::Number(v.into())
                }
                "FLOAT4" | "float4" | "REAL" | "real" => {
                    let v: f32 = row.get(name);
                    if let Some(n) = serde_json::Number::from_f64(v as f64) {
                        Value::Number(n)
                    } else {
                        Value::String(v.to_string())
                    }
                }
                "FLOAT8" | "float8" | "DOUBLE PRECISION" | "double precision" => {
                    let v: f64 = row.get(name);
                    if let Some(n) = serde_json::Number::from_f64(v) {
                        Value::Number(n)
                    } else {
                        Value::String(v.to_string())
                    }
                }
                "VARCHAR" | "varchar" | "CHAR" | "char" | "TEXT" | "text" | "BPCHAR" | "bpchar" => {
                    let v: String = row.get(name);
                    Value::String(v)
                }
                "UUID" | "uuid" => {
                    if let Ok(v) = row.try_get::<uuid::Uuid, _>(name) {
                        Value::String(v.to_string())
                    } else {
                        let v: String = row.get(name);
                        Value::String(v)
                    }
                }
                "JSON" | "json" | "JSONB" | "jsonb" => {
                    let v: Value = row.get(name);
                    v
                }
                _ => {
                    if let Ok(v) = row.try_get::<String, _>(name) {
                        Value::String(v)
                    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(name) {
                        Value::String(v.to_rfc3339())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(name) {
                        Value::String(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(name) {
                        Value::String(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(name) {
                        Value::String(v.to_string())
                    } else if let Ok(v) = row.try_get::<Vec<String>, _>(name) {
                        json!(v)
                    } else {
                        // Fallback: try to decode custom enums or simple custom types from raw bytes
                        if let Ok(bytes) = val.as_bytes() {
                            if let Ok(s) = std::str::from_utf8(bytes) {
                                if !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c.is_ascii_punctuation() || c.is_whitespace()) {
                                    Value::String(s.to_string())
                                } else {
                                    Value::String(format!("<type: {}>", type_name))
                                }
                            } else {
                                Value::String(format!("<type: {}>", type_name))
                            }
                        } else {
                            Value::String(format!("<type: {}>", type_name))
                        }
                    }
                }
            }
        };
        map.insert(name.to_string(), json_val);
    }
    Ok(map)
}

#[derive(serde::Deserialize)]
pub struct FilterOption {
    pub column: String,
    pub operator: String,
    pub value: Value,
}

#[derive(serde::Deserialize)]
pub struct SortOption {
    pub column: String,
    pub direction: String, // "ASC" or "DESC"
}

pub async fn fetch_table_rows(
    pool: &PgPool,
    schema: &str,
    table: &str,
    limit: i64,
    offset: i64,
    filters: Vec<FilterOption>,
    sort: Option<SortOption>,
) -> Result<QueryResult> {
    let start_time = std::time::Instant::now();
    let q_schema = quote_ident(schema);
    let q_table = quote_ident(table);

    // Fetch incoming relations to compile virtual relation counts
    let incoming_relations = crate::metadata::get_incoming_relations(pool, schema, table)
        .await
        .unwrap_or_default();

    let mut select_clauses = vec![format!("{}.*", q_table)];
    for rel in &incoming_relations {
        let q_src_schema = quote_ident(&rel.source_schema);
        let q_src_table = quote_ident(&rel.source_table);
        let q_src_col = quote_ident(&rel.source_column);
        let q_tgt_col = quote_ident(&rel.target_column);
        let virtual_col_name = quote_ident(&format!("{} []", rel.source_table));

        select_clauses.push(format!(
            "(SELECT count(*)::int FROM {}.{} WHERE {} = {}.{}) as {}",
            q_src_schema,
            q_src_table,
            q_src_col,
            q_table,
            q_tgt_col,
            virtual_col_name
        ));
    }

    // Build query text
    let mut sql = format!(
        "SELECT {} FROM {}.{} as {}",
        select_clauses.join(", "),
        q_schema,
        q_table,
        q_table
    );

    // Handle filters safely
    // Since SQLx doesn't support easy dynamic queries without build strings, 
    // we compile the filter conditions using parameterized syntax ($1, $2, etc.) and bind the values.
    let mut bind_values: Vec<Value> = Vec::new();
    if !filters.is_empty() {
        sql.push_str(" WHERE ");
        let mut clauses = Vec::new();
        for filter in filters {
            let q_col = quote_ident(&filter.column);
            let op = match filter.operator.as_str() {
                "equals" => "=",
                "not equals" => "!=",
                "greater than" => ">",
                "less than" => "<",
                "greater than or equal" => ">=",
                "less than or equal" => "<=",
                "contains" => "ILIKE",
                "starts with" => "ILIKE",
                "ends with" => "ILIKE",
                "is null" => "IS NULL",
                "is not null" => "IS NOT NULL",
                _ => "=",
            };

            if filter.operator == "is null" || filter.operator == "is not null" {
                clauses.push(format!("{} {}", q_col, op));
            } else {
                bind_values.push(filter.value.clone());
                let idx = bind_values.len();
                let param_ref = format!("${}", idx);
                
                if filter.operator == "contains" {
                    // Re-bind value as %value%
                    let last_idx = bind_values.len() - 1;
                    if let Some(s) = bind_values[last_idx].as_str() {
                        bind_values[last_idx] = json!(format!("%{}%", s));
                    }
                } else if filter.operator == "starts with" {
                    let last_idx = bind_values.len() - 1;
                    if let Some(s) = bind_values[last_idx].as_str() {
                        bind_values[last_idx] = json!(format!("{}%", s));
                    }
                } else if filter.operator == "ends with" {
                    let last_idx = bind_values.len() - 1;
                    if let Some(s) = bind_values[last_idx].as_str() {
                        bind_values[last_idx] = json!(format!("%{}", s));
                    }
                }

                clauses.push(format!("{} {} {}", q_col, op, param_ref));
            }
        }
        sql.push_str(&clauses.join(" AND "));
    }

    // Handle sort safely
    if let Some(sort_opt) = sort {
        let q_col = quote_ident(&sort_opt.column);
        let dir = if sort_opt.direction.to_uppercase() == "DESC" { "DESC" } else { "ASC" };
        sql.push_str(&format!(" ORDER BY {} {}", q_col, dir));
    }

    // Add pagination params
    sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

    // Compile dynamic sqlx query
    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()));
    for val in bind_values {
        // Dynamic binding
        if let Some(s) = val.as_str() {
            query = query.bind(s.to_string());
        } else if let Some(b) = val.as_bool() {
            query = query.bind(b);
        } else if let Some(i) = val.as_i64() {
            query = query.bind(i);
        } else if let Some(f) = val.as_f64() {
            query = query.bind(f);
        } else {
            query = query.bind(val.to_string());
        }
    }

    let db_rows = query.fetch_all(pool).await?;

    let mut columns = Vec::new();
    let mut rows = Vec::new();

    if !db_rows.is_empty() {
        // Get column names
        columns = db_rows[0]
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect();

        for row in &db_rows {
            rows.push(pg_row_to_json(row)?);
        }
    }

    let affected_rows = db_rows.len() as u64;
    let execution_time_ms = start_time.elapsed().as_millis() as u64;

    Ok(QueryResult {
        columns,
        rows,
        affected_rows,
        execution_time_ms,
    })
}

pub async fn count_table_rows(
    pool: &PgPool,
    schema: &str,
    table: &str,
) -> Result<i64> {
    let q_schema = quote_ident(schema);
    let q_table = quote_ident(table);
    let sql = format!("SELECT COUNT(*)::bigint FROM {}.{}", q_schema, q_table);

    let row = sqlx::query_scalar::<_, i64>(sqlx::AssertSqlSafe(sql.as_str()))
        .fetch_one(pool)
        .await?;

    Ok(row)
}

#[derive(serde::Deserialize)]
pub struct PendingChange {
    pub r#type: String, // "update", "delete", "insert"
    pub table_schema: String,
    pub table_name: String,
    // For updates and deletes
    pub primary_key_column: Option<String>,
    pub primary_key_value: Option<Value>,
    // For updates and inserts
    pub column_values: Option<Map<String, Value>>,
}

pub async fn apply_changes(pool: &PgPool, changes: Vec<PendingChange>) -> Result<()> {
    let mut tx = pool.begin().await?;

    for change in changes {
        let q_schema = quote_ident(&change.table_schema);
        let q_table = quote_ident(&change.table_name);

        match change.r#type.as_str() {
            "update" => {
                let pk_col = change.primary_key_column.as_deref().ok_or_else(|| {
                    AppError::Validation("Primary key column missing for update".to_string())
                })?;
                let pk_val = change.primary_key_value.as_ref().ok_or_else(|| {
                    AppError::Validation("Primary key value missing for update".to_string())
                })?;
                let col_vals = change.column_values.as_ref().ok_or_else(|| {
                    AppError::Validation("Column values missing for update".to_string())
                })?;

                if col_vals.is_empty() {
                    continue;
                }

                let mut set_clauses = Vec::new();
                let mut binds: Vec<Value> = Vec::new();

                for (col, val) in col_vals {
                    binds.push(val.clone());
                    let param_ref = format!("${}", binds.len());
                    set_clauses.push(format!("{} = {}", quote_ident(col), param_ref));
                }

                binds.push(pk_val.clone());
                let pk_ref = format!("${}", binds.len());

                let sql = format!(
                    "UPDATE {}.{} SET {} WHERE {} = {}",
                    q_schema,
                    q_table,
                    set_clauses.join(", "),
                    quote_ident(pk_col),
                    pk_ref
                );

                let mut q = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()));
                for bind in binds {
                    if let Some(s) = bind.as_str() {
                        q = q.bind(s.to_string());
                    } else if let Some(b) = bind.as_bool() {
                        q = q.bind(b);
                    } else if let Some(i) = bind.as_i64() {
                        q = q.bind(i);
                    } else if let Some(f) = bind.as_f64() {
                        q = q.bind(f);
                    } else if bind.is_null() {
                        q = q.bind(None::<String>);
                    } else {
                        q = q.bind(bind.to_string());
                    }
                }
                q.execute(&mut *tx).await?;
            }
            "delete" => {
                let pk_col = change.primary_key_column.as_deref().ok_or_else(|| {
                    AppError::Validation("Primary key column missing for delete".to_string())
                })?;
                let pk_val = change.primary_key_value.as_ref().ok_or_else(|| {
                    AppError::Validation("Primary key value missing for delete".to_string())
                })?;

                let sql = format!(
                    "DELETE FROM {}.{} WHERE {} = $1",
                    q_schema,
                    q_table,
                    quote_ident(pk_col)
                );

                let mut q = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()));
                if let Some(s) = pk_val.as_str() {
                    q = q.bind(s.to_string());
                } else if let Some(i) = pk_val.as_i64() {
                    q = q.bind(i);
                } else {
                    q = q.bind(pk_val.to_string());
                }
                q.execute(&mut *tx).await?;
            }
            "insert" => {
                let col_vals = change.column_values.as_ref().ok_or_else(|| {
                    AppError::Validation("Column values missing for insert".to_string())
                })?;

                if col_vals.is_empty() {
                    continue;
                }

                let mut cols = Vec::new();
                let mut param_refs = Vec::new();
                let mut binds = Vec::new();

                for (col, val) in col_vals {
                    cols.push(quote_ident(col));
                    binds.push(val.clone());
                    param_refs.push(format!("${}", binds.len()));
                }

                let sql = format!(
                    "INSERT INTO {}.{} ({}) VALUES ({})",
                    q_schema,
                    q_table,
                    cols.join(", "),
                    param_refs.join(", ")
                );

                let mut q = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()));
                for bind in binds {
                    if let Some(s) = bind.as_str() {
                        q = q.bind(s.to_string());
                    } else if let Some(b) = bind.as_bool() {
                        q = q.bind(b);
                    } else if let Some(i) = bind.as_i64() {
                        q = q.bind(i);
                    } else if let Some(f) = bind.as_f64() {
                        q = q.bind(f);
                    } else if bind.is_null() {
                        q = q.bind(None::<String>);
                    } else {
                        q = q.bind(bind.to_string());
                    }
                }
                q.execute(&mut *tx).await?;
            }
            _ => return Err(AppError::Validation(format!("Unknown change type: {}", change.r#type))),
        }
    }

    tx.commit().await?;
    Ok(())
}
