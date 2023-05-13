import { allAgenciesConfig } from "@transitchat/shared";

import { agencyFileUpload } from "./upload";
import { downloadFile, extractZip, listDir, makeDir } from "./utils/files";

export const envAgencies = process.env.AGENCIES?.split(",") as string[];

if (envAgencies.length === 0) throw Error("Missing AGENCIES in .env");

export const loadAgencies = async () => {
  makeDir(".zip");
  makeDir(".zip/csv");

  const allAgencies = await allAgenciesConfig();
  const agencies = allAgencies.filter((el) => envAgencies.includes(el.id));

  // // download and extract all gtfs files
  for (const agency of agencies) {
    const fileName = `.zip/${agency.id}.zip`;
    const outDir = `.zip/csv/${agency.id}`;
    await downloadFile(agency.url, fileName);
    extractZip(fileName, outDir);
    const files = listDir(outDir).filter(
      (fileName) => !agency.exclude.includes(fileName.split(".")[0])
    );
    await agencyFileUpload(agency.id, files);
    console.log("fin");
  }
};

loadAgencies();
