#!/usr/bin/env node

import { readdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { program } from "commander";
import ora from "ora";
import chalk from "chalk";

const WORK_DIR = "/var/opt/mssql/backup";

const execAsync = promisify(exec);

program
  .requiredOption("-c, --container <name>", "The name of the docker container running mssql.")
  .option("-d, --dir <path>", "Directory containing the *.bak files to restore.", ".")
  .option("-s, --server <host>", "Host of the mssql server instance running inside a docker container.", "localhost")
  .option("-u, --user <username>", "Username for mssql server authentication.", "SA")
  .requiredOption("-p, --pass <password>", "Password for mssql server authentication.");

const { container, dir, server, user, pass } = program.parse().opts();

try {
  console.info("Restoring databases...");

  await execAsync(`docker exec -i ${container} mkdir -p ${WORK_DIR}`);

  const files = await readdir(dir);

  for (const file of files.filter((file) => file.endsWith(".bak"))) {
    const [db] = file.split(".");
    const prefixText = chalk.blue(`[${db}]`);
    const spinner = ora({ color: "yellow", prefixText }).start();

    try {
      await execAsync(`docker cp ${dir}/${file} ${container}:${WORK_DIR}`, { stdio: "inherit" });

      const fileListOuput = await sqlcmd(`RESTORE FILELISTONLY FROM DISK = '${WORK_DIR}/${file}'`);

      const cols = fileListOuput.slice(0, fileListOuput.indexOf("\n")).split(/[\s]{2,}/g);
      const rows = fileListOuput
        .split("\n")
        .slice(2, -3)
        .map((str) => str.split(/[\s]{2,}/g));

      const logicalNameIndex = cols.indexOf("LogicalName");
      const physicalNameIndex = cols.indexOf("PhysicalName");

      const restoreOutput = await sqlcmd(
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

      const result = restoreOutput.split("\n").filter(Boolean).at(-1);
      spinner.succeed(result);
    } catch (err) {
      spinner.fail(err.message);
    }
  }

  console.info(chalk.green("All databases successfully restored."));
} catch (err) {
  console.error(err);
}

async function sqlcmd(query) {
  const output = await execAsync(
    [
      `docker exec -i ${container} /opt/mssql-tools/bin/sqlcmd`,
      `-S ${server}`,
      `-U "${user}"`,
      `-P "${pass}"`,
      `-Q "${query}"`,
    ].join(" ")
  );

  if (output.stderr) throw Error(output.stderr);

  return output.stdout;
}
