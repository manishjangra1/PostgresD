use sqlx::postgres::PgPool;
use sqlx::Row;
use serde::Serialize;
use crate::error::Result;

#[derive(Serialize)]
pub struct DatabaseInfo {
    pub name: String,
}

#[derive(Serialize)]
pub struct SchemaInfo {
    pub name: String,
}

#[derive(Serialize)]
pub struct TableInfo {
    pub name: String,
    pub is_view: bool,
}

#[derive(Serialize, Clone)]
pub struct ForeignKeyInfo {
    pub schema: String,
    pub table: String,
    pub column: String,
    pub target_column: String,
}

#[derive(Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub r#type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary: bool,
    pub foreign_key: Option<ForeignKeyInfo>,
}

#[derive(Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub index_type: String,
    pub is_unique: bool,
    pub is_primary: bool,
    pub definition: String,
}

#[derive(Serialize)]
pub struct RelationInfo {
    pub constraint_name: String,
    pub column_name: String,
    pub foreign_schema: String,
    pub foreign_table: String,
    pub foreign_column: String,
}

#[derive(Serialize, Clone)]
pub struct IncomingRelation {
    pub constraint_name: String,
    pub source_schema: String,
    pub source_table: String,
    pub source_column: String,
    pub target_schema: String,
    pub target_table: String,
    pub target_column: String,
}

pub async fn get_incoming_relations(pool: &PgPool, schema: &str, table: &str) -> Result<Vec<IncomingRelation>> {
    let rows = sqlx::query(
        r#"SELECT DISTINCT
            tc.constraint_name as constraint_name,
            tc.table_schema as source_schema,
            tc.table_name as source_table,
            kcu.column_name as source_column,
            ccu.table_schema as target_schema,
            ccu.table_name as target_table,
            ccu.column_name as target_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.constraint_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_schema = $1
            AND ccu.table_name = $2
          ORDER BY tc.constraint_name;"#
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| IncomingRelation {
            constraint_name: r.get::<String, _>("constraint_name"),
            source_schema: r.get::<String, _>("source_schema"),
            source_table: r.get::<String, _>("source_table"),
            source_column: r.get::<String, _>("source_column"),
            target_schema: r.get::<String, _>("target_schema"),
            target_table: r.get::<String, _>("target_table"),
            target_column: r.get::<String, _>("target_column"),
        })
        .collect())
}

pub async fn list_databases(pool: &PgPool) -> Result<Vec<DatabaseInfo>> {
    let rows = sqlx::query(
        "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;"
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| DatabaseInfo {
            name: r.get::<String, _>("datname"),
        })
        .collect())
}

pub async fn list_schemas(pool: &PgPool) -> Result<Vec<SchemaInfo>> {
    let rows = sqlx::query(
        "SELECT schema_name FROM information_schema.schemata 
         WHERE schema_name NOT IN ('information_schema', 'pg_catalog') 
           AND schema_name NOT LIKE 'pg_toast%' AND schema_name NOT LIKE 'pg_temp%'
         ORDER BY schema_name;"
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| SchemaInfo {
            name: r.get::<String, _>("schema_name"),
        })
        .collect())
}

pub async fn list_tables(pool: &PgPool, schema: &str) -> Result<Vec<TableInfo>> {
    let rows = sqlx::query(
        "SELECT table_name, table_type FROM information_schema.tables 
         WHERE table_schema = $1 AND table_type IN ('BASE TABLE', 'VIEW')
         ORDER BY table_name;"
    )
    .bind(schema)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| TableInfo {
            name: r.get::<String, _>("table_name"),
            is_view: r.get::<String, _>("table_type") == "VIEW",
        })
        .collect())
}

pub async fn get_table_columns(pool: &PgPool, schema: &str, table: &str) -> Result<Vec<ColumnInfo>> {
    let rows = sqlx::query(
        r#"SELECT 
            c.column_name as name, 
            c.udt_name as type, 
            c.is_nullable as is_nullable, 
            c.column_default as default_value,
            (
              SELECT count(*)::int > 0 
              FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
              WHERE tc.table_schema = c.table_schema 
                AND tc.table_name = c.table_name 
                AND kcu.column_name = c.column_name 
                AND tc.constraint_type = 'PRIMARY KEY'
            ) as is_primary
          FROM information_schema.columns c
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position;"#
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await?;

    let mut columns: Vec<ColumnInfo> = rows
        .into_iter()
        .map(|r| ColumnInfo {
            name: r.get::<String, _>("name"),
            r#type: r.get::<String, _>("type"),
            nullable: r.get::<String, _>("is_nullable") == "YES",
            default_value: r.get::<Option<String>, _>("default_value"),
            is_primary: r.get::<bool, _>("is_primary"),
            foreign_key: None,
        })
        .collect();

    // Append virtual relation columns
    if let Ok(relations) = get_incoming_relations(pool, schema, table).await {
        for rel in relations {
            columns.push(ColumnInfo {
                name: format!("{} []", rel.source_table),
                r#type: format!("{}[]", rel.source_table),
                nullable: true,
                default_value: None,
                is_primary: false,
                foreign_key: Some(ForeignKeyInfo {
                    schema: rel.source_schema.clone(),
                    table: rel.source_table.clone(),
                    column: rel.source_column.clone(),
                    target_column: rel.target_column.clone(),
                }),
            });
        }
    }

    Ok(columns)
}

pub async fn get_table_indexes(pool: &PgPool, schema: &str, table: &str) -> Result<Vec<IndexInfo>> {
    let rows = sqlx::query(
        r#"SELECT
            i.relname as index_name,
            am.amname as index_type,
            idx.indisunique as is_unique,
            idx.indisprimary as is_primary,
            pg_get_indexdef(idx.indexrelid) as definition
          FROM pg_index idx
          JOIN pg_class t ON t.oid = idx.indrelid
          JOIN pg_class i ON i.oid = idx.indexrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_am am ON am.oid = i.relam
          WHERE n.nspname = $1 AND t.relname = $2
          ORDER BY i.relname;"#
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| IndexInfo {
            name: r.get::<String, _>("index_name"),
            index_type: r.get::<String, _>("index_type"),
            is_unique: r.get::<bool, _>("is_unique"),
            is_primary: r.get::<bool, _>("is_primary"),
            definition: r.get::<String, _>("definition"),
        })
        .collect())
}

pub async fn get_table_relations(pool: &PgPool, schema: &str, table: &str) -> Result<Vec<RelationInfo>> {
    let rows = sqlx::query(
        r#"SELECT
            tc.constraint_name as constraint_name,
            kcu.column_name as column_name,
            ccu.table_schema as foreign_schema,
            ccu.table_name as foreign_table,
            ccu.column_name as foreign_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
          ORDER BY tc.constraint_name;"#
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| RelationInfo {
            constraint_name: r.get::<String, _>("constraint_name"),
            column_name: r.get::<String, _>("column_name"),
            foreign_schema: r.get::<String, _>("foreign_schema"),
            foreign_table: r.get::<String, _>("foreign_table"),
            foreign_column: r.get::<String, _>("foreign_column"),
        })
        .collect())
}
