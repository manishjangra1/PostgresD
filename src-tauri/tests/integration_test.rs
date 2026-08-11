use tauri_app_lib::connection::{ConnectionManager, ConnectionConfig};
use tauri_app_lib::metadata;
use tauri_app_lib::database;

#[tokio::test]
async fn test_database_pipeline() {
    // 1. Establish connection options
    let config = ConnectionConfig {
        host: "localhost".to_string(),
        port: 5432,
        user: "postgres".to_string(),
        password: Some("password".to_string()),
        database: "postgres".to_string(),
        ssl_mode: Some("Disable".to_string()),
    };

    let manager = ConnectionManager::new();
    let conn_id = "test-connection-uuid";

    // 2. Connect to the local Docker database
    manager.connect(conn_id, &config.to_connection_string())
        .await
        .expect("Should connect to local Docker PG");

    let pool = manager.get_pool(conn_id)
        .await
        .expect("Should retrieve connection pool");

    // 3. Test list_databases
    let dbs = metadata::list_databases(&pool)
        .await
        .expect("Should fetch databases list");
    assert!(dbs.iter().any(|db| db.name == "postgres"));

    // 4. Test list_schemas
    let schemas = metadata::list_schemas(&pool)
        .await
        .expect("Should fetch schemas list");
    assert!(schemas.iter().any(|s| s.name == "public"));

    // 5. Test count_rows of users table
    let count = database::count_table_rows(&pool, "public", "users")
        .await
        .expect("Should count table rows");
    assert_eq!(count, 3);

    // 6. Test fetch_table_rows
    let results = database::fetch_table_rows(
        &pool,
        "public",
        "users",
        10,
        0,
        vec![],
        None,
    )
    .await
    .expect("Should fetch table rows");
    assert_eq!(results.rows.len(), 3);

    // 7. Cleanup
    manager.disconnect(conn_id)
        .await
        .expect("Should disconnect cleanly");
}
