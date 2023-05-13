import { GetObjectCommand, PutObjectCommand, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3"
import { ReadStream } from "fs"
import { allAgencies, ENVCONFIG } from "../../index"
import { GlueClient, BatchCreatePartitionCommand } from "@aws-sdk/client-glue"
import { AgencyConfig } from "../type"
import { jsonToTable } from "./file"
import { now } from "./time"
import { Feature, GeoJsonProperties, Point } from "geojson"

export const updateLive = async (type: string, agency: AgencyConfig, data: any) => {
  await uploadToAWS(`live/${agency}/${type}.json`, JSON.stringify(data), "application/json")
}

const updateStops = async (agencyStops: any[]) => {
  for (let stops of agencyStops) {
    if (!stops) continue
    const { agency, stop_updates } = stops

    try {
      const config = allAgencies.find((e) => e.id === agency)

      if (!config) return

      const { year, month, day, hour } = now(null, config.timezone)

      if (!stop_updates || !stop_updates[0]) continue
      const fields = Object.keys(stop_updates[0])

      const table = await jsonToTable(stop_updates, fields)
      await uploadToAWS(`stops/${agency}/${year}/${month}/${day}/${hour}/${new Date()}.csv`, table, "text/csv")
      await updateLive("stops", agency, stop_updates)

      console.log(`Uploaded ${agency} stops`)
    } catch (e) {
      console.log(e)
      logError(
        {
          type: "issue updating stops",
          path: "sync",
          function: { name: "stopUpdates" },
        },
        e,
      )
      console.log("issue with agency stop upates")
    }
  }
}

const updateVehicles = async (agencyVehicles: any[]) => {
  for (let vehicleData of agencyVehicles) {
    const { agency, geojson } = vehicleData // ! GEOJSON IS EMPTY
    try {
      const config = allAgencies.find((e) => e.id === agency)

      if (!config) return

      const { year, month, day, hour } = now(null, config.timezone)
      if (!geojson.features[0]) continue
      const fields = Object.keys(geojson.features[0].properties)
      const features = geojson.features.map((el: Feature<Point, GeoJsonProperties>) => el.properties)

      const table = await jsonToTable(features, fields)

      await uploadToAWS(`vehicles/${agency}/${year}/${month}/${day}/${hour}/${new Date()}.csv`, table, "text/csv")

      await updateLive("vehicles", agency, geojson)

      const { missingTrips = [] } = vehicleData

      await updateLive("missing_trips", agency, missingTrips)

      if (missingTrips.length > 0) {
        const fields = Object.keys(missingTrips[0])
        const missingTripsTable = await jsonToTable(missingTrips, fields)

        await uploadToAWS(
          `missing_trips/${agency}/${year}/${month}/${day}/${hour}/${new Date()}.csv`,
          missingTripsTable,
          "text/csv",
        )
      }
      console.log(`Uploaded ${agency} vehicles`)
    } catch (e) {
      console.log(e)
      logError(
        {
          type: "issue updating vehicles",
          path: "sync",
          function: { name: "stopUpdates", agency },
        },
        e,
      )
      console.log("missing vehicles")
    }
  }
}

const getAllStops = async () => {
  const response = []
  for (let agency of allAgencies) {
    if (!agency.updates.stops) continue
    const update = await agency.updates.stops(agency)
    response.push(update)
  }
  return response
}

const getAllVehicles = async () => {
  const response = []
  for (let agency of allAgencies) {
    try {
      if (!agency.updates.vehicles) continue
      response.push(await agency.updates.vehicles(agency))
    } catch (e) {
      logError(
        {
          path: "sync",
          function: { name: "allVehicles", agency: agency.id },
        },
        e,
      )
    }
  }
  return response
}

export const getAllRealtime = async () => {
  const stops = await getAllStops()
  const vehicles = await getAllVehicles()
  return {
    stops,
    vehicles,
  }
}

export const syncRealtime = async () => {
  const response = await getAllRealtime()

  for (let type in response) {
    try {
      switch (type) {
        case "stops":
          await updateStops(response[type])
          break
        case "vehicles":
          await updateVehicles(response[type])
          break
        default:
          logError(
            {
              type: "unknown key",
              path: "sync",
              function: { name: "syncRealtime", type },
            },
            "unknown key",
          )
          console.error("unknown key")
      }
    } catch (e) {
      console.log("issue with upload")
      console.log(type)
      console.log(e)
    }
  }
}

export const nightlyGlueUpdate = async () => {
  const glue = new GlueClient({
    credentials: {
      accessKeyId: ENVCONFIG.AWS_ACCESS_KEY_ID, // AWS_ACCESS_KEY_ID
      secretAccessKey: ENVCONFIG.AWS_SECRET_ACCESS_KEY, // AWS_SECRET_ACCESS_KEY
    },
    region: "us-east-1",
  })

  const vehiclesPartition = ({
    agencyId,
    year,
    month,
    day,
    hour,
  }: {
    agencyId: string
    year: number | string
    day: number | string
    month: number | string
    hour: number | string
  }) => {
    return {
      Values: [agencyId, year.toString(), month.toString(), day.toString(), hour.toString()],
      StorageDescriptor: {
        Columns: [
          {
            Name: "objectid",
            Type: "bigint",
            Comment: "",
          },
          {
            Name: "trip_id",
            Type: "bigint",
            Comment: "",
          },
          {
            Name: "vehicle_id",
            Type: "bigint",
            Comment: "",
          },
          {
            Name: "route_id",
            Type: "bigint",
            Comment: "",
          },
          {
            Name: "direction_id",
            Type: "bigint",
            Comment: "",
          },
          {
            Name: "timestamp",
            Type: "bigint",
            Comment: "",
          },
          {
            Name: "delay",
            Type: "bigint",
            Comment: "",
          },
          {
            Name: "delay_type",
            Type: "string",
            Comment: "",
          },
          {
            Name: "headsign",
            Type: "string",
            Comment: "",
          },
          {
            Name: "route_short_name",
            Type: "string",
            Comment: "",
          },
          {
            Name: "route_long_name",
            Type: "string",
            Comment: "",
          },
          {
            Name: "longitude",
            Type: "double",
            Comment: "",
          },
          {
            Name: "latitude",
            Type: "double",
            Comment: "",
          },
        ],
        SerdeInfo: {
          Name: "vehicles",
          SerializationLibrary: "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe",
          Parameters: {
            "field.delim": ",",
          },
        },
        Location: `s3://transitnode/vehicles/${agencyId}/${year}/${month}/${day}/${hour}/`,
        InputFormat: "org.apache.hadoop.mapred.TextInputFormat",
        OutputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
        Compressed: false,

        Parameters: {
          "skip.header.line.count": "1",
          SizeKey: "3285",
          ObjectCount: "1",
          Delimiter: ",",
          RecordCount: "31",
          AverageRecordSize: "105",
          CompressionType: "none",
          Classification: "csv",
          TypeOfData: "file",
        },
        SkewedInfo: {},
        StoredAsSubDirectories: false,
      },
      Parameters: {},
    }
  }

  const trips_geo_partitician = ({
    agencyId,
    year,
    month,
    day,
  }: {
    agencyId: string
    year: number | string
    month: number | string
    day: number | string
  }) => {
    return {
      Values: [agencyId, year.toString(), month.toString(), day.toString()],

      StorageDescriptor: {
        Columns: [
          {
            Name: "id",
            Type: "bigint",
          },
          {
            Name: "trip_id",
            Type: "string",
          },
          {
            Name: "shape_id",
            Type: "string",
          },
          {
            Name: "service_id",
            Type: "string",
          },
          {
            Name: "direction_id",
            Type: "bigint",
          },
          {
            Name: "block_id",
            Type: "string",
          },
          {
            Name: "route_id",
            Type: "string",
          },
          {
            Name: "agency_id",
            Type: "bigint",
          },
          {
            Name: "route_short_name",
            Type: "string",
          },
          {
            Name: "route_long_name",
            Type: "string",
          },
          {
            Name: "route_desc",
            Type: "string",
          },
          {
            Name: "route_type",
            Type: "bigint",
          },
          {
            Name: "route_color",
            Type: "string",
          },
          {
            Name: "route_text_color",
            Type: "string",
          },
          {
            Name: "route_sort_order",
            Type: "bigint",
          },
          {
            Name: "min_headway_minutes",
            Type: "string",
          },
          {
            Name: "start_time",
            Type: "string",
          },
          {
            Name: "end_time",
            Type: "string",
          },
        ],
        SerdeInfo: {
          Name: "trips_geo",
          SerializationLibrary: "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe",
          Parameters: {
            "field.delim": ",",
          },
        },
        Location: `s3://transitnode/trips_geo/${agencyId}/${year}/${month}/${day}/`,
        InputFormat: "org.apache.hadoop.mapred.TextInputFormat",
        OutputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
        Compressed: false,
        Parameters: {
          "skip.header.line.count": "1",
          SizeKey: "202832628",
          ObjectCount: "213",
          RecordCount: "1567376",
          AverageRecordSize: "124",
          CompressionType: "none",
          Classification: "csv",
          TypeOfData: "file",
        },
        SkewedInfo: {},
        StoredAsSubDirectories: false,
      },
      Parameters: {},
    }
  }

  const hours = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]

  const { year, month, day } = now()

  const PartitionInputList: any[] = []

  allAgencies.forEach((agency: AgencyConfig) => {
    hours.forEach((hour) => PartitionInputList.push(vehiclesPartition({ agencyId: agency.id, year, month, day, hour })))
  })

  const respVehicles = await glue.send(
    new BatchCreatePartitionCommand({
      DatabaseName: "transit_node_testing",
      TableName: "vehicles",
      PartitionInputList,
    }),
  )
  console.log(respVehicles)

  const tripsParticians = allAgencies.map((agency: AgencyConfig) => {
    return trips_geo_partitician({
      agencyId: agency.id,
      year,
      month,
      day,
    })
  })

  const respTripsGeo = await glue.send(
    new BatchCreatePartitionCommand({
      DatabaseName: "transit_node_testing",
      TableName: "trips_geo",
      PartitionInputList: tripsParticians,
    }),
  )
  console.log(respTripsGeo)
}

export const logError = async (req: any, error: any) => {
  error.self = error
  const path = req.path
  const { year, month, day, epoch, hour } = now(new Date())
  await uploadToAWS(
    `error/${path}/${year}/${month}/${day}/${hour}/${epoch}.json`,
    JSON.stringify({
      ...req,
      error: `${error}`,
    }),
    "application/json",
  )
}

export const s3Client = () => {
  return new S3Client({
    credentials: {
      accessKeyId: ENVCONFIG.AWS_ACCESS_KEY_ID, // AWS_ACCESS_KEY_ID
      secretAccessKey: ENVCONFIG.AWS_SECRET_ACCESS_KEY, // AWS_SECRET_ACCESS_KEY
    },
    region: "us-east-1",
  })
}

const uploadToAWS = async (Key: string, Body: ReadStream | string, ContentType: string | undefined | null = null) => {
  const params: PutObjectCommandInput = {
    Bucket: ENVCONFIG.AWS_BUCKET,
    Key,
    Body,
  }
  if (ContentType) params.ContentType = ContentType
  try {
    const result = await s3Client().send(new PutObjectCommand(params))
    console.log(result)
  } catch (error) {
    console.error(error)
  }
}

export const downloadFromAws = async (Key: string) => {
  const params = {
    Bucket: process.env.BUCKET,
    Key,
  }
  try {
    const result = await s3Client().send(new GetObjectCommand(params))
    console.log(result)
    console.log(`Downloaded: ${Key}`)
  } catch (error) {
    console.error(error)
  }
}

// const awsNamingRegex = /\s\-/gm; // ! DOESNT WORK *shrug
export const validAwsKey = (fileName: string) => {
  return fileName.replaceAll(" ", "_").replaceAll("-", "_")
}

export { uploadToAWS }
