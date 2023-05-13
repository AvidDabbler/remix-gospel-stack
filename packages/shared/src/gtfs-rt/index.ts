import GtfsRealtimeBindings from "gtfs-realtime-bindings"
import axios from "axios"
// import moment from "moment"
// import { timezoneOffset } from "../utils/time"
// import { blockStopTimeQuery } from "../utils/queries"
import {  start_time_update, VehicleProperties } from "../types/index"
import { Feature, Point } from "geojson"

export const delayType = (delay: number) => {
  if (delay >= 300) {
    return "late"
  } else if (delay <= -60) {
    return "early"
  } else {
    return "on-time"
  }
}

export const convertPbFeed = async (url: string) => {
  try {
    const response = await axios
      .get(url, {
        url: url,
        responseType: "arraybuffer",
      })
      .then((res) => {
        return res.data
      })

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response))
    return feed.entity
  } catch (error) {
    console.log(error)
    process.exit(1)
  }
}

// ! this could probably be made generic

// makePointFeature({...properties}: {[k: string]: string | number | float | any[] }, lat: string, lon: string)
export const translateVehicle = async ({
  id,
  tripId,
  stop_time_update,
  start_time,
  delay,
  routeId,
  lon,
  lat,
  vehicleId,
  directionId,
  timestamp,
  headsign,
  route_short_name,
  route_long_name,
}: {
  id: number
  tripId: string
  stop_time_update: start_time_update[]
  start_time: string
  delay: number
  lat: number
  lon: number
  routeId: string
  vehicleId: string
  directionId: number
  timestamp: number
  headsign: string
  route_short_name: string
  route_long_name: string
}): Promise<Feature<Point, VehicleProperties>> => {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [lon, lat],
    },
    properties: {
      id,
      trip_id: tripId,
      vehicle_id: vehicleId,
      route_id: routeId,
      direction_id: directionId,
      timestamp,
      stop_time_update,
      start_time,
      delay,
      delay_type: delayType(delay),
      headsign,
      route_short_name,
      route_long_name,
      lon,
      lat,
    },
  }
}

export const indirectTripIdMatch = async (
  tripUpdates: GtfsRealtimeBindings.transit_realtime.IFeedEntity[],
  tripIds: string[],
) => {
  const delay = tripUpdates.find((veh) => {
    tripIds.includes(veh.tripUpdate?.trip.tripId ?? "")
  })
  const stopUpdate = delay?.tripUpdate?.stopTimeUpdate?.[0] ?? null
  const stopId = stopUpdate?.stopId
  const stopSequence = stopUpdate?.stopSequence ?? null
  return {
    stopId,
    stopSequence,
    delay: delay?.tripUpdate?.delay,
    start_time: delay?.tripUpdate?.trip.startTime,
    stop_time_update: delay?.tripUpdate?.stopTimeUpdate?.map((veh) => {
      return {
        stop_id: veh.stopId,
        stop_sequence: veh.stopSequence,
        delay: veh.departure?.delay,
        time: veh.departure?.time,
      }
    }),
  }
}

export const getTripInfo = async ({
  tripId,
  tripUpdates,
  tripIds,
}: {
  tripId: string
  tripUpdates: GtfsRealtimeBindings.transit_realtime.IFeedEntity[]
  tripIds: string[]
}) => {
  try {
    const delay = tripUpdates.find((veh) => veh.tripUpdate?.trip.tripId === tripId)
    if (
      delay &&
      (delay?.tripUpdate?.stopTimeUpdate?.length ?? 0) > 0 &&
      delay?.tripUpdate?.stopTimeUpdate?.[0] !== null &&
      delay?.tripUpdate?.stopTimeUpdate?.[0] !== undefined
    ) {
      const update = (delay.tripUpdate?.stopTimeUpdate ?? 0).length > 0 ? delay?.tripUpdate?.stopTimeUpdate?.[0] : null
      const stopId = update ? update.stopId : -9999
      const stopSequence = update ? update.stopSequence : -9999

      return {
        stopId,
        stopSequence,
        delay: delay?.tripUpdate?.delay,
        start_time: delay.tripUpdate.trip.startTime,
        stop_time_update: delay.tripUpdate.stopTimeUpdate.map((veh) => {
          return {
            stop_id: veh.stopId,
            stop_sequence: veh.stopSequence,
            delay: veh.departure?.delay,
            time: veh.departure?.time,
          }
        }),
      }
    } else {
      return await indirectTripIdMatch(tripUpdates, tripIds)
    }
  } catch (e) {
    console.log(e)
    return { stopId: null, stopSequence: null, delay: null }
  }
}

// export const getStopTime = async ({
//   agency,
//   tripId,
//   stopId,
//   timezone,
// }: {
//   agency: AgencyConfig
//   tripId: string
//   stopId: string
//   stopSequence: number
//   timezone: string
// }) => {
//   const tDate = moment().tz(timezone).format("yyyy-MM-DD")

//   const query = blockStopTimeQuery(timezoneOffset(agency.timezone), tDate, tripId, stopId)

//   const response = await agency.query(query)
//   return response
// }
