pub mod error;
pub mod credentials;
pub mod connection;
pub mod database;
pub mod metadata;
pub mod commands;

use connection::ConnectionManager;
use database::QueryRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ConnectionManager::new())
        .manage(QueryRegistry::new())
        .invoke_handler(tauri::generate_handler![
            commands::test_connection,
            commands::connect_database,
            commands::disconnect_database,
            commands::list_databases,
            commands::list_schemas,
            commands::list_tables,
            commands::get_table_columns,
            commands::get_table_indexes,
            commands::get_table_relations,
            commands::fetch_table_rows,
            commands::count_table_rows,
            commands::apply_changes,
            commands::execute_query,
            commands::cancel_query,
            commands::save_password,
            commands::get_password,
            commands::delete_password,
            commands::export_table_to_csv,
            commands::show_save_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
