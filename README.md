# docker-mssql-restore

This is a simple CLI tool to automate the restoration of MSSQL database backups (\*.bak files) into a Docker container running the [official Microsoft SQL Server image](https://hub.docker.com/_/microsoft-mssql-server). Requires Node v16 or greater.

## Usage

Run from anywhere using `npx` and passing the required options:
```sh
npx docker-mssql-restore --container <CONTAINER_NAME> --pass <MSSQL_USER_PASSWORD>
```

List all options with:
```sh
npx docker-mssql-restore --help
```
