// import { calculateTimetamp } from "@transitchat/shared/src/utils/time"
// import { getScheduleDate } from "@transitchat/shared/src/utils/trips"

import { pgClient, pgp, prisma, StopTimes } from "@transitchat/database";
import csvtojson from "csvtojson";

const colParser = {
  id: "string",
  service_id: "string",
  route_id: "string",
  route_short_name: "string",
  route_long_name: "string",
  network_id: "string",
  route_text_color: "string",
  route_color: "string",
  shape_id: "string",
  stop_id: "string",
  stop_code: "string",
  wheelchair_boarding: "string",
  tc_agency_id: "string",
  stop_name: "string",
  tts_stop_name: "string",
  stop_desc: "string",
  zone_id: "string",
  stop_url: "string",
  location_type: "string",
  parent_station: "string",
  stop_timezone: "string",
  level_id: "string",
  platform_code: "string",
  from_stop_id: "string",
  to_stop_id: "string",
  from_route_id: "string",
  to_route_id: "string",
  from_trip_id: "string",
  to_trip_id: "string",
  trip_id: "string",
  trip_headsign: "string",
  trip_short_name: "string",
  block_id: "string",
  bikes_allowed: "string",
};

const shapesGeomInsertStatement = (timestamp: Date, agencyId: string) => {
  return `insert into "shapesGeos" 
            select tc_agency_id, shape_id, 
            to_timestamp(${timestamp.getTime()} / 1000.0) as updatedAt, 
            ST_GeomFromText('LineString(' || pt_seq || ')', 4326) as geom
            from (select tc_agency_id, shape_id, string_agg(shape_pt_lon || ' ' || shape_pt_lat, ',' order by shape_pt_sequence) as pt_seq
              from shapes where tc_agency_id = '${agencyId}'
              group by tc_agency_id, shape_id
            ) shp`;
};

const stopsGeomUpdate = async (agencyId: string) => {
  const res = await prisma.$executeRaw`
                  update stops
                  set geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat),4326)
                  where tc_agency_id = ${agencyId}`;

  //console.log(`stops geom update result: ${res}`)
};

const deleteStatement = (fileName: string, agencyId: string) => {
  return `DELETE FROM "${fileName.replace(
    ".txt",
    ""
  )}" WHERE tc_agency_id = '${agencyId}'`;
};

const convertFile = async (
  fileName: string,
  timestamp: Date,
  agencyId: string,
  filterOut: (j: any) => boolean = () => true
) => {
  return await csvtojson({ colParser, checkType: true, ignoreEmpty: true })
    .fromFile(`.zip/csv/${agencyId}/${fileName}`)
    .then((json) => {
      const newArr = [];
      for (const item of json) {
        if (!filterOut(item)) continue;
        newArr.push({
          ...item,
          tc_agency_id: agencyId,
          updatedAt: timestamp,
        });
      }
      return newArr;
    });
};

// ! i stole this from here - https://dev.to/yogski/optimizing-conditional-bulk-insert-in-node-js-postgresql-26gd
const bulkInsertStatement = (tableName: string, bulkData: any[]) => {
  try {
    const columns = Object.keys(bulkData[0]).map((str) => str.trim());
    const setTable = new pgp.helpers.ColumnSet(columns, { table: tableName });
    return pgp.helpers.insert(bulkData, setTable);
  } catch (error) {
    console.log({ error });
    throw Error("Cannot create insert query for: " + tableName);
  }
};

const execInsertDeleteTransaction = async (
  tableName: string,
  deleteStatement: string,
  insertStatement: string
) => {
  return await pgClient
    .tx(`update ${tableName}`, async (t) => {
      await t.none(deleteStatement);
      await t.none(insertStatement);
    })
    .catch((err) => {
      console.error(`issue with updating ${tableName}`);
    });
};

const insertAndDeleteTransaction = async (
  fileName: string,
  bulkData: any[],
  deleteStatement: string
) => {
  const tablename = fileName.replace(".txt", "");
  const insertStatement = bulkInsertStatement(tablename, bulkData);
  return await pgClient
    .tx(`update ${tablename}`, async (t) => {
      await t.none(deleteStatement);
      await t.none(insertStatement);
    })
    .catch((err) => {
      console.log(err);
      console.error(`issue with updating ${tablename}`);
    });
};

const deleteAndBulkInsertTransaction = async (
  tableName: string,
  bulkData: any[],
  deleteStatement: string
) => {
  const insertStatement = bulkInsertStatement(tableName, bulkData);
  return await execInsertDeleteTransaction(
    tableName,
    deleteStatement,
    insertStatement
  );
};

const agencyImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  const json = await convertFile(fileName, timestamp, agencyId);

  await prisma.$transaction([
    prisma.agency.deleteMany({
      where: { tc_agency_id: agencyId },
    }),
    prisma.agency.createMany({
      data: json.map((agency) => {
        return {
          ...agency,
          agency_id: agencyId,
        };
      }),
    }),
  ]);
};

const calendarImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  const json = await convertFile(fileName, timestamp, agencyId);

  await prisma.$transaction([
    prisma.calendar.deleteMany({
      where: { tc_agency_id: agencyId },
    }),
    prisma.calendar.createMany({
      data: json,
    }),
  ]);
};

const calendarDatesImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  const json = await convertFile(fileName, timestamp, agencyId);
  await prisma.$transaction([
    prisma.calendarDates.deleteMany({
      where: { tc_agency_id: agencyId },
    }),
    prisma.calendarDates.createMany({
      data: json,
    }),
  ]);
};

const routesImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  const json = await convertFile(fileName, timestamp, agencyId);
  await prisma.$transaction([
    prisma.routes.deleteMany({
      where: { tc_agency_id: agencyId },
    }),
    prisma.routes.createMany({
      data: json.map((routes) => {
        return {
          ...routes,
          agency_id: agencyId,
        };
      }),
    }),
  ]);
};

const shapesImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  // shapes.txt -> shapes data table
  const json = await convertFile(fileName, timestamp, agencyId);
  const deleteQuery = deleteStatement(fileName, agencyId);
  await deleteAndBulkInsertTransaction("shapes", json, deleteQuery);

  // shapes data table -> shape geos
  const insertQueryGeom = shapesGeomInsertStatement(timestamp, agencyId);
  const deleteQueryGeom = deleteStatement("shapesGeos", agencyId);
  await execInsertDeleteTransaction(
    "shapesGeos",
    deleteQueryGeom,
    insertQueryGeom
  );
};

// ! this does not work - might have something to do with new import times
const stopTimesImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  try {
    const json = (await convertFile(
      fileName,
      timestamp,
      agencyId
    )) as StopTimes[];
    const deleteQuery = deleteStatement("stopTimes", agencyId);

    // json.forEach(item => {
    //   // const date = getScheduleDate()
    //   return {
    //     ...item,
    //     arrival_timestamp: calculateTimetamp(item.arrival_time),
    //     departure_timestamp: calculateTimetamp(item.departure_time)
    //   }
    // })

    // !update to have arrival and departure timestamps converted if not present
    await deleteAndBulkInsertTransaction("stopTimes", json, deleteQuery);
  } catch (e) {
    console.log(e);
  }
};

const stopsImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  let json = await convertFile(fileName, timestamp, agencyId);
  json = json.map((item) => {
    delete item.stop_desc;
    return {
      ...item,
      geom: null,
    };
  });
  const deleteQuery = deleteStatement(fileName, agencyId);
  await deleteAndBulkInsertTransaction("stops", json, deleteQuery);
  await stopsGeomUpdate(agencyId);
};

const transfersImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  const json = await convertFile(fileName, timestamp, agencyId);
  await prisma.$transaction([
    prisma.transfers.deleteMany({
      where: { tc_agency_id: agencyId },
    }),
    prisma.transfers.createMany({
      data: json,
    }),
  ]);
};

const tripsImport = async (
  agencyId: string,
  fileName: string,
  timestamp: Date
) => {
  try {
    const json = await convertFile(fileName, timestamp, agencyId);
    const deleteQuery = deleteStatement(fileName, agencyId);
    await deleteAndBulkInsertTransaction("trips", json, deleteQuery);
  } catch (e) {
    console.log(e);
  }
};

export const agencyFileUpload = async (outDir: string, fileLocs: string[]) => {
  const timestamp = new Date();

  const agency = await prisma.tCAgency.findFirst({
    where: { tc_agency_id: outDir },
  });

  if (!agency) {
    await prisma.tCAgency.create({
      data: {
        tc_agency_id: outDir,
        timezone: "Americas/Chicago",
        agency_name: outDir,
      },
    });
  }

  for (const fileName of fileLocs) {
    console.log(`start of ${fileName}`);
    switch (fileName) {
      case "agency.txt":
        await agencyImport(outDir, fileName, timestamp);
        break;
      case "calendar.txt":
        await calendarImport(outDir, fileName, timestamp);
        break;
      case "calendar_dates.txt":
        await calendarDatesImport(outDir, fileName, timestamp);
        break;
      case "routes.txt":
        await routesImport(outDir, fileName, timestamp);
        break;
      case "shapes.txt":
        await shapesImport(outDir, fileName, timestamp);
        break;
      case "stop_times.txt":
        await tripsImport(outDir, "trips.txt", timestamp);
        await stopTimesImport(outDir, fileName, timestamp);
        break;
      case "stops.txt":
        await stopsImport(outDir, fileName, timestamp);
        break;
      case "transfers.txt":
        await transfersImport(outDir, fileName, timestamp);
        break;
      // case "trips.txt":
      //   await tripsImport(outDir, fileName, timestamp)
      //   break
      default:
        console.log("unknown file");
        break;
    }
    console.log(`end of ${fileName}`);
  }
};
