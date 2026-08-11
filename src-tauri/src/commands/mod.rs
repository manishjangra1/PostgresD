use tauri::State;
use sqlx::{Row, Column, ValueRef};
use futures::StreamExt;
use crate::error::{Result, AppError};
use crate::connection::{ConnectionManager, ConnectionConfig};
use crate::database::{QueryResult, QueryRegistry, FilterOption, SortOption, PendingChange};
use crate::metadata::{DatabaseInfo, SchemaInfo, TableInfo, ColumnInfo, IndexInfo, RelationInfo};
use crate::credentials;

#[tauri::command]
pub async fn test_connection(config: ConnectionConfig) -> Result<()> {
    ConnectionManager::test_connection(&config.to_connection_string()).await
}

#[tauri::command]
pub async fn connect_database(
    id: String,
    config: ConnectionConfig,
    manager: State<'_, ConnectionManager>,
) -> Result<()> {
    manager.connect(&id, &config.to_connection_string()).await
}

#[tauri::command]
pub async fn disconnect_database(
    id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<()> {
    manager.disconnect(&id).await
}

#[tauri::command]
pub async fn list_databases(
    id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<DatabaseInfo>> {
    let pool = manager.get_pool(&id).await?;
    crate::metadata::list_databases(&pool).await
}

#[tauri::command]
pub async fn list_schemas(
    id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<SchemaInfo>> {
    let pool = manager.get_pool(&id).await?;
    crate::metadata::list_schemas(&pool).await
}

#[tauri::command]
pub async fn list_tables(
    id: String,
    schema: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<TableInfo>> {
    let pool = manager.get_pool(&id).await?;
    crate::metadata::list_tables(&pool, &schema).await
}

#[tauri::command]
pub async fn get_table_columns(
    id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ColumnInfo>> {
    let pool = manager.get_pool(&id).await?;
    crate::metadata::get_table_columns(&pool, &schema, &table).await
}

#[tauri::command]
pub async fn get_table_indexes(
    id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<IndexInfo>> {
    let pool = manager.get_pool(&id).await?;
    crate::metadata::get_table_indexes(&pool, &schema, &table).await
}

#[tauri::command]
pub async fn get_table_relations(
    id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<RelationInfo>> {
    let pool = manager.get_pool(&id).await?;
    crate::metadata::get_table_relations(&pool, &schema, &table).await
}

#[tauri::command]
pub async fn fetch_table_rows(
    id: String,
    schema: String,
    table: String,
    limit: i64,
    offset: i64,
    filters: Vec<FilterOption>,
    sort: Option<SortOption>,
    manager: State<'_, ConnectionManager>,
) -> Result<QueryResult> {
    let pool = manager.get_pool(&id).await?;
    crate::database::fetch_table_rows(&pool, &schema, &table, limit, offset, filters, sort).await
}

#[tauri::command]
pub async fn count_table_rows(
    id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<i64> {
    let pool = manager.get_pool(&id).await?;
    crate::database::count_table_rows(&pool, &schema, &table).await
}

#[tauri::command]
pub async fn apply_changes(
    id: String,
    changes: Vec<PendingChange>,
    manager: State<'_, ConnectionManager>,
) -> Result<()> {
    let pool = manager.get_pool(&id).await?;
    crate::database::apply_changes(&pool, changes).await
}

#[tauri::command]
pub async fn execute_query(
    id: String,
    sql: String,
    manager: State<'_, ConnectionManager>,
    registry: State<'_, QueryRegistry>,
) -> Result<QueryResult> {
    let pool = manager.get_pool(&id).await?;
    let start_time = std::time::Instant::now();

    // 1. Fetch pg_backend_pid
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&pool)
        .await?;

    // 2. Register active query PID
    registry.register(&id, pid as u32).await;

    // 3. Execute
    let result = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .fetch_all(&pool)
        .await;

    // 4. Unregister active query PID
    registry.unregister(&id).await;

    let db_rows = result?;

    let mut columns = Vec::new();
    let mut rows = Vec::new();

    if !db_rows.is_empty() {
        columns = db_rows[0]
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect();

        for row in &db_rows {
            rows.push(crate::database::pg_row_to_json(row)?);
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

#[tauri::command]
pub async fn cancel_query(
    id: String,
    manager: State<'_, ConnectionManager>,
    registry: State<'_, QueryRegistry>,
) -> Result<bool> {
    let pool = manager.get_pool(&id).await?;
    registry.cancel(&pool, &id).await
}

#[tauri::command]
pub async fn save_password(id: String, password: String) -> Result<()> {
    credentials::set_password(&id, &password)
}

#[tauri::command]
pub async fn get_password(id: String) -> Result<String> {
    credentials::get_password(&id)
}

#[tauri::command]
pub async fn delete_password(id: String) -> Result<()> {
    credentials::delete_password(&id)
}

#[tauri::command]
pub async fn export_table_to_csv(
    id: String,
    schema: String,
    table: String,
    filepath: String,
    manager: State<'_, ConnectionManager>,
) -> Result<()> {
    let pool = manager.get_pool(&id).await?;
    let q_schema = crate::database::quote_ident(&schema);
    let q_table = crate::database::quote_ident(&table);
    let sql = format!("SELECT * FROM {}.{}", q_schema, q_table);

    // 1. Create file writer
    let file = std::fs::File::create(filepath)?;
    let mut wtr = csv::Writer::from_writer(file);

    // 2. Fetch rows streamingly from PgPool
    let mut cursor = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .fetch(&pool);

    // 3. Retrieve column names for header
    let mut header_written = false;

    while let Some(row_result) = cursor.next().await {
        let row = row_result?;
        
        if !header_written {
            let cols: Vec<String> = row.columns().iter().map(|c| c.name().to_string()).collect();
            wtr.write_record(&cols)
                .map_err(|e| AppError::Export(e.to_string()))?;
            header_written = true;
        }

        let mut record = Vec::new();
        for col in row.columns() {
            let name = col.name();
            let raw_val = row.try_get_raw(name);
            let val_str = if raw_val.as_ref().map(|v| v.is_null()).unwrap_or(true) {
                String::new()
            } else {
                let val = raw_val.unwrap();
                if let Ok(v) = row.try_get::<String, _>(name) {
                    v
                } else if let Ok(v) = row.try_get::<serde_json::Value, _>(name) {
                    v.to_string()
                } else if let Ok(v) = row.try_get::<i64, _>(name) {
                    v.to_string()
                } else if let Ok(v) = row.try_get::<f64, _>(name) {
                    v.to_string()
                } else if let Ok(v) = row.try_get::<bool, _>(name) {
                    v.to_string()
                } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(name) {
                    v.to_rfc3339()
                } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(name) {
                    v.to_string()
                } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(name) {
                    v.to_string()
                } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(name) {
                    v.to_string()
                } else if let Ok(v) = row.try_get::<uuid::Uuid, _>(name) {
                    v.to_string()
                } else {
                    // Try to decode custom enums or raw bytes if valid UTF-8
                    if let Ok(bytes) = val.as_bytes() {
                        if let Ok(s) = std::str::from_utf8(bytes) {
                            if !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c.is_ascii_punctuation() || c.is_whitespace()) {
                                s.to_string()
                            } else {
                                String::new()
                            }
                        } else {
                            String::new()
                        }
                    } else {
                        String::new()
                    }
                }
            };
            record.push(val_str);
        }
        wtr.write_record(&record)
            .map_err(|e| AppError::Export(e.to_string()))?;
    }

    wtr.flush()?;
    Ok(())
}

#[tauri::command]
pub async fn write_text_file(filepath: String, content: String) -> Result<()> {
    std::fs::write(filepath, content)?;
    Ok(())
}

#[tauri::command]
pub async fn show_save_dialog(
    default_name: String,
    filters: Vec<(String, Vec<String>)>,
) -> Result<Option<String>> {
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_title("Export File")
        .set_file_name(&default_name);

    for (name, exts) in &filters {
        let exts_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter(name, &exts_refs);
    }

    let file = dialog.save_file().await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}
