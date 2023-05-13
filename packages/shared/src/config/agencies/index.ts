import { stlouisConfig } from "./agencies/stlouis"
import * as fs from "fs"
import { AgencyConfig } from "../../types"
import { gmvAgencies } from "./gmv/gmv"

export const allAgenciesConfig = async (): Promise<AgencyConfig[]> => {
  return [stlouisConfig, ...(await gmvAgencies())]
}

export const fileToString = (fileLoc: string) => fs.readFileSync(fileLoc).toString()
