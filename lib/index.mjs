import { readdir } from "fs/promises";
import { execSync } from "child_process";
import { program } from "commander";
import chalk from "chalk";

const WORK_DIR = "/var/opt/mssql/backup";

if (+process.versions.node.split(".")[0] < 16) {
  console.error("Node.js v16 or higher required.\nYour version: " + process.version);
  process.exit(1);
}

program
  .requiredOption("-c, --container <name>", "The name of the docker container running mssql.")
  .option("-d, --dir <path>", "Directory containing the *.bak files to restore.", ".")
  .option("-s, --server <host>", "Host of the mssql server instance running inside a docker container.", "localhost")
  .option("-u, --user <username>", "Username for mssql server authentication.", "SA")
  .requiredOption("-p, --pass <password>", "Password for mssql server authentication.");

const { container, dir, server, user, pass } = program.parse().opts();

try {
  console.info("Restoring databases...");

  execSync(`docker exec -i ${container} mkdir -p ${WORK_DIR}`);

  const files = await readdir(dir);

  for (const file of files.filter((file) => file.endsWith(".bak"))) {
    execSync(`docker cp ${dir}/${file} ${container}:${WORK_DIR}`, { stdio: "inherit" });

    const fileListOuput = sqlcmd(`RESTORE FILELISTONLY FROM DISK = '${WORK_DIR}/${file}'`);

    const cols = fileListOuput.slice(0, fileListOuput.indexOf("\n")).split(/[\s]{2,}/g);
    const rows = fileListOuput
      .split("\n")
      .slice(2, -3)
      .map((str) => str.split(/[\s]{2,}/g));

    const [db] = file.split(".");
    const logicalNameIndex = cols.indexOf("LogicalName");
    const physicalNameIndex = cols.indexOf("PhysicalName");

    const restoreOutput = sqlcmd(
      [
        `RESTORE DATABASE ${db} FROM DISK = '${WORK_DIR}/${file}'`,
        `WITH ${rows
          .map((row) => {
            const logicalName = row[logicalNameIndex];
            const physicalName = row[physicalNameIndex].split("\\").at(-1);
            return `MOVE '${logicalName}' TO '/var/opt/mssql/data/${physicalName}'`;
          })
          .join(", ")}`,
      ].join(" ")
    );

    console.info(`${chalk.blue(`[${db}]`)} ${restoreOutput.split("\n").filter(Boolean).at(-1)}`);
  }

  console.info(chalk.green("All databases successfully restored."));
} catch (err) {
  console.error(err);
}

function sqlcmd(query) {
  return execSync(
    [
      `docker exec -i ${container} /opt/mssql-tools/bin/sqlcmd`,
      `-S ${server}`,
      `-U "${user}"`,
      `-P "${pass}"`,
      `-Q "${query}"`,
    ].join(" ")
  ).toString();
}
