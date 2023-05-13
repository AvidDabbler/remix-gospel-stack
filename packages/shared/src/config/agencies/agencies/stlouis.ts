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
  StopType,
  StopUpdateType,
  VehicleProperties,
  VehicleType,
} from "../../../types/agency";
import { calculateSecondsAfterMidnight } from "../../../utils/time";
import {
  findMissingTrips,
  getScheduleDate,
  getServiceIds,
} from "../../../utils/trips";

const vehicleUpdates = async (agency: AgencyConfig): Promise<VehicleType> => {
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

const stopUpdates = async (agency: AgencyConfig): Promise<StopType> => {
  const tripUpdates: GtfsRealtimeBindings.transit_realtime.IFeedEntity[] =
    await convertPbFeed(stlouisConfig.tripUpdates);

  let updates: StopUpdateType[] = [];
  let oid = 0;

  for (let tripUpdate of tripUpdates) {
    if (
      !tripUpdate ||
      !tripUpdate.vehicle ||
      !tripUpdate.tripUpdate?.stopTimeUpdate ||
      !tripUpdate.tripUpdate?.vehicle?.label ||
      !tripUpdate.tripUpdate.trip.tripId ||
      !tripUpdate.tripUpdate.trip.routeId ||
      !tripUpdate.tripUpdate.trip.directionId
    )
      continue;

    const label = tripUpdate.tripUpdate.vehicle.label;
    const { directionId, routeId, tripId } = tripUpdate.tripUpdate.trip;

    const route_number = label?.split(" ")[0];
    for (let stop_time_update of tripUpdate.tripUpdate?.stopTimeUpdate) {
      const { stopId, stopSequence } = stop_time_update;
      const delay = stop_time_update.departure?.delay;

      if (!stopId) {
        console.warn("missing stopId");
        continue;
      }
      if (!delay) {
        console.warn("missing delay");
        continue;
      }
      updates.push({
        oid,
        stop_id: stopId,
        stop_sequence: stopSequence ?? -1,
        delay,
        type: "bus",
        trip_id: tripId,
        route_id: routeId,
        route_number,
        direction_id: directionId,
      });
      oid = oid + 1;
    }
  }

  return {
    agency: agency.id,
    type: "stops",
    stop_updates: [...updates],
  };
};

export const stlouisConfig: AgencyConfig = {
  id: "stlouis",
  name: "St Louis",
  url: "https://metrostlouis.org/Transit/google_transit.zip",
  tripUpdates: "https://www.metrostlouis.org/RealTimeData/StlRealTimeTrips.pb",
  vehicleUpdates:
    "https://www.metrostlouis.org/RealTimeData/StlRealTimeVehicles.pb",
  exclude: ["directions"],
  timezone: "America/Chicago",
  excludeList: ["MLR,MetroLink Red Line", "MetroLink Blue Line"],
  updates: {
    vehicles: vehicleUpdates,
    stops: stopUpdates,
    alerts: undefined,
  },
};
