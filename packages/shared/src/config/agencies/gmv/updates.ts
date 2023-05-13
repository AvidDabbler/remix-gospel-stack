import fs from "fs";
import { prisma } from "@transitchat/database";
import type { Feature, Point } from "geojson";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

import {
  convertPbFeed,
  getTripInfo,
  translateVehicle,
} from "../../../gtfs-rt/index";
import {
  AgencyConfig,
  VehicleProperties,
  VehicleType,
} from "../../../types/index";
import { calculateSecondsAfterMidnight } from "../../../utils/time";
import {
  findMissingTrips,
  getScheduleDate,
  getServiceIds,
} from "../../../utils/trips";

const stopUpdates = async (agency: AgencyConfig) => {
  const tripUpdates: GtfsRealtimeBindings.transit_realtime.IFeedEntity[] =
    await convertPbFeed(agency.tripUpdates);

  let updates: any[] = [];
  let oid = 0;
  console.log(tripUpdates[0]);
  for (let tripUpdate of tripUpdates) {
    try {
      console.log(tripUpdate);
      if (
        !tripUpdate ||
        !tripUpdate.tripUpdate?.vehicle ||
        !tripUpdate.tripUpdate?.stopTimeUpdate
      )
        continue;

      // const { label } = tripUpdate.tripUpdate.vehicle ?? {};
      // const { tripId, directionId, startTime } =
      //   tripUpdate.tripUpdate.trip ?? {};
      // const route_number = label.split(" ")[0];
      for (let stopTimeUpdate of tripUpdate.tripUpdate?.stopTimeUpdate) {
        try {
          const { stopId, stopSequence } = stopTimeUpdate;
          // const { delay } = stopTimeUpdate.departure;
          // updates = [
          //   ...updates,
          //   {
          //     oid,
          //     stop_id: stopId,
          //     stop_sequence: stopSequence,
          //     delay,
          //     type: "bus",
          //     trip_id: tripId,
          //     route_id: routeId,
          //     route_number,
          //     direction_id: directionId,
          //   },
          // ];
          oid = oid + 1;
        } catch (e) {
          console.log(e);
          console.log("issue with vehicle");
        }
      }
    } catch (e) {
      console.log(e);
      console.log("issue with vehicle");
    }
  }

  return {
    agency: agency.id,
    type: "stops",
    stop_updates: [...updates],
  };
};

const tripUpdates = async (agency: AgencyConfig) => {
  console.log(`----- START OF TRIP UPDATES - "${agency.id}" -----`);
  console.log({ agency });
  return { resp: "something" };
};

const vehicleUpdates = async (agency: AgencyConfig): Promise<VehicleType> => {
  console.log(`----- START OF VEHICLE UPDATES - "${agency.id}" -----`);
  console.log({ agency });
  const vehicleRequest: GtfsRealtimeBindings.transit_realtime.IFeedEntity[] =
    await convertPbFeed(agency.vehicleUpdates);
  const tripUpdateRequest: GtfsRealtimeBindings.transit_realtime.IFeedEntity[] =
    await convertPbFeed(agency.tripUpdates);
  const scheduleDate = await getScheduleDate(agency);
  const secAfterMidnight = calculateSecondsAfterMidnight(agency, scheduleDate);
  const service_ids = await getServiceIds(agency, scheduleDate);
  const features: Feature<Point, VehicleProperties>[] = [];

  for (let vehicleFeature of vehicleRequest) {
    try {
      const tripId = vehicleFeature?.vehicle?.trip?.tripId ?? undefined;
      const tripInfo = await prisma.trips.findFirst({
        where: { trip_id: tripId, tc_agency_id: agency.id },
        include: { Routes: true },
      });
      if (!tripId) continue;
      const id: number = features.length;

      const tripIds = tripUpdateRequest.reduce((acc: string[], item) => {
        if (typeof item.tripUpdate?.trip.tripId === "string") {
          acc.push(item.tripUpdate?.trip.tripId);
        }
        return acc;
      }, []);

      const { stop_time_update, delay, start_time } = await getTripInfo({
        tripId,
        tripUpdates: tripUpdateRequest,
        tripIds,
      });

      const lon = vehicleFeature.vehicle?.position?.longitude;
      const lat = vehicleFeature.vehicle?.position?.latitude;
      const vehicleId = vehicleFeature.vehicle?.vehicle?.id
        ? vehicleFeature.vehicle?.vehicle?.id.toString()
        : undefined;
      const directionId = vehicleFeature.vehicle?.trip?.directionId;
      // @ts-ignore-next-line
      const timestamp = vehicleFeature.vehicle?.timestamp?.low;

      if (
        !tripInfo ||
        tripInfo.Routes.length > 0 ||
        !lon ||
        !lat ||
        !vehicleId ||
        directionId === undefined ||
        directionId === null ||
        timestamp === undefined ||
        timestamp === null ||
        !stop_time_update ||
        delay === undefined ||
        delay === null ||
        !start_time
      ) {
        continue;
      }

      features.push(
        await translateVehicle({
          id,
          tripId,
          stop_time_update,
          start_time,
          delay,
          lat,
          lon,
          routeId: tripInfo.Routes[0].route_id,
          vehicleId,
          directionId,
          timestamp,
          headsign: tripInfo.trip_headsign ?? "",
          route_short_name: tripInfo.Routes[0].route_short_name ?? "",
          route_long_name: tripInfo.Routes[0].route_long_name ?? "",
        })
      );
    } catch (e) {
      console.log(e);
      console.log("issue with vehicle");
    }
  }

  return {
    agency: agency.id,
    type: "vehicles",
    missingTrips: await findMissingTrips(
      features,
      agency,
      secAfterMidnight,
      service_ids
    ),
    geojson: {
      type: "FeatureCollection",
      features,
    },
  };
};

const alertUpdates = (agency: AgencyConfig) => {
  console.log(`----- START OF ALERT UPDATES - "${agency.id}" -----`);
  console.log({ agency });
};

// ! build in different functions for api access if available
export const gmvUpdates: AgencyConfig["updates"] = {
  stops: undefined,
  vehicles: vehicleUpdates,
  missingTrips: undefined,
  alerts: alertUpdates,
};
