import { prisma } from "@transitchat/database";
import { Feature, Point } from "geojson";
import moment, { Moment } from "moment-timezone";

import { AgencyConfig, VehicleProperties } from "../types/agency";

const dayOfWeek = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const getServiceIds = async (
  config: AgencyConfig,
  serviceDate: Moment
) => {
  const date = parseInt(serviceDate.format("yyyyMMdd"));
  const calendarDates = (
    await prisma.calendarDates.findMany({
      select: {
        service_id: true,
      },
      where: {
        date: {
          equals: date,
        },
      },
    })
  ).map((item) => item.service_id);
  if (calendarDates.length > 0) {
    return calendarDates;
  } else {
    const dow = dayOfWeek[serviceDate.day()];
    return (
      await prisma.calendar.findMany({
        where: {
          AND: [
            {
              start_date: {
                gte: date,
              },
            },
            {
              end_date: {
                lte: date,
              },
            },
            { tc_agency_id: config.id, [dow]: 1 },
          ],
        },
        select: {
          service_id: true,
        },
      })
    ).map((item) => item.service_id);
  }
};

export const defaultMissingTrips = async (
  config: AgencyConfig,
  tripsList: string[],
  secAfterMidnight: number,
  service_ids: string[]
) => {
  const missingTrips = await prisma.trips.findMany({
    select: {
      trip_id: true,
      service_id: true,
      Routes: {
        select: {
          route_id: true,
          route_long_name: true,
          route_short_name: true,
        },
      },
      stopTimes: {
        select: {
          arrival_timestamp: true,
          departure_timestamp: true,
        },
        where: {
          AND: [
            {
              arrival_timestamp: {
                lte: secAfterMidnight,
                gte: secAfterMidnight,
              },
            },
            {
              tc_agency_id: config.id,
            },
          ],
        },
        take: 1,
        orderBy: {
          arrival_timestamp: "desc",
        },
      },
    },
    where: {
      AND: [
        {
          trip_id: {
            notIn: tripsList,
          },
        },
        {
          stopTimes: {
            every: {
              arrival_timestamp: {
                lte: secAfterMidnight,
                gte: secAfterMidnight,
              },
            },
          },
        },
        {
          tc_agency_id: config.id,
        },
        {
          service_id: {
            in: service_ids,
          },
        },
        {
          Routes: {
            every: {
              route_long_name: {
                notIn: config.excludeList,
              },
            },
          },
        },
      ],
    },
  });

  return missingTrips.map((item) => {
    return {
      trip_id: item.trip_id,
      service_id: item.service_id,
      acceptable_service_id: item.service_id,
      trip_start_time: item.stopTimes[0].departure_timestamp,
      trip_end_time: item.stopTimes[0].arrival_timestamp,
      route_id: item.Routes[0].route_id,
      route_long_name: item.Routes[0].route_long_name,
    };
  });
};

export const findMissingTrips = async (
  vehiclesJson: Feature<Point, VehicleProperties>[],
  config: AgencyConfig,
  secAfterMidnight: number,
  service_ids: string[]
) => {
  try {
    const tripsList = vehiclesJson.map((veh) => `'${veh.properties.trip_id}'`);
    return await defaultMissingTrips(
      config,
      tripsList,
      secAfterMidnight,
      service_ids
    );
  } catch (e) {
    console.log(e);
    return [];
  }
};

export function changeTimeZone(date: Date, timeZone: string) {
  if (typeof date === "string") {
    return new Date(
      new Date(date).toLocaleString("en-US", {
        timeZone,
      })
    );
  }

  return new Date(
    date.toLocaleString("en-US", {
      timeZone,
    })
  );
}

export const timezoneOffset = (timezone: string) => {
  const newDate = new Date();
  const localTime = changeTimeZone(newDate, timezone);
  const utc = changeTimeZone(newDate, "UTC");
  // @ts-ignore-next-line
  return (localTime - utc) / 1000;
};

export const getScheduleDate = async (config: AgencyConfig) => {
  const timeFormat = "hh:mm:ss";
  const returnFormat = "yyyy-MM-DD";
  const maxTime = await prisma.stopTimes.aggregate({
    where: { tc_agency_id: config.id },
    _max: { arrival_time: true },
  });

  const time = moment(new Date(), timeFormat).tz(config.timezone);
  const beforeTime = moment("00:00:00", timeFormat).tz(config.timezone);
  const afterTime = moment(maxTime._max.arrival_time, timeFormat).tz(
    config.timezone
  );

  // ! RETURNS STRING BECAUSE OF DATE CORUPTIONS
  if (time.isBetween(beforeTime, afterTime)) {
    // return moment().tz(config.timezone).subtract(1, "day").toDate()
    return moment().tz(config.timezone).subtract(1, "day");
  } else {
    // return moment().tz(config.timezone).toDate()
    return moment().tz(config.timezone);
  }
};
