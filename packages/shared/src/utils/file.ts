import { existsSync, mkdirSync, rmSync, unlink, writeFile } from "node:fs";
import path from "path";
import { parse } from "json2csv";

export const removeCommasFromJson = (json: any) => {
  return json.reduce((acc: any[], row: any) => {
    const newRow: any = {};
    for (const [key, value] of Object.entries(row) as [
      k: string,
      v: string | number
    ][]) {
      if (typeof value === "string") {
        newRow[key] = value.toString().replaceAll(",", " -");
      } else {
        newRow[key] = value;
      }
    }
    return [...acc, newRow];
  }, []);
};

export const jsonToTable = async (json: any, fields: any[]) => {
  const newJson = removeCommasFromJson(json);
  try {
    const opts = { fields, quote: "" };
    const csv = parse(newJson, opts);
    return csv;
  } catch (err) {
    throw new Error("issue parsing table");
  }
};

export const validAwsKey = (fileName: string) => {
  return fileName.replaceAll(" ", "_").replaceAll("-", "_");
};

export const createExportFolder = async (agency: string) => {
  const __dirname = path.resolve();

  const dir = __dirname + "/export/" + validAwsKey(agency);
  makeDir(dir);
};

export const makeDir = (dir: string) => {
  // Check for dbDir and delete it if it exists
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(dir);

    // make db dir
    mkdirSync(dir);
  }
};

export const deleteFile = (location: string) => {
  if (!existsSync(location)) return;

  unlink(location, function (err) {
    if (err) {
      console.error("File not found: " + location);
    } else {
      console.log("File Delete Successfuly: ", location);
    }
  });
};

export const saveFile = (data: string | Buffer, fileName: string) => {
  writeFile(fileName, data, (err) => {
    if (err) console.log(err);
    else {
      console.log("File written successfully\n");
      console.log("The written has the following contents:");
    }
  });
};
