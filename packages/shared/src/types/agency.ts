import { FeatureCollection, Point } from "geojson"
import CsvParse from "csv-parse"

export type AgencyConfig = {
  id: string
  name: string
  timezone: string
  excludeList?: string[]
  url: string
  tripUpdates: string
  vehicleUpdates: string
  alertUpdates?: string
  endTime?: Date
  exclude: string[]
  updates: {
    stops?: ((agency: AgencyConfig) => Promise<StopType>) | undefined
    vehicles?: ((agency: AgencyConfig) => Promise<VehicleType>) | undefined
    missingTrips?: undefined | ((agency: AgencyConfig) => void)
    alerts?: undefined | ((agency: AgencyConfig) => void)
  }
  csvOptions?: CsvParse.Options
}

export type MissingTrip = {
  trip_id: string
  service_id: string
  acceptable_service_id: string
  trip_start_time: number | null
  trip_end_time: number | null
  route_id: string
  route_long_name: string | null
}

export type VehicleType = {
  agency: string
  type: string
  missingTrips: MissingTrip[]
  geojson: FeatureCollection<Point, VehicleProperties>
}

export type StopType = {
  agency: string
  type: string
  stop_updates: StopUpdateType[]
}

export type VehicleProperties = {
  id: number
  trip_id: string
  stop_time_update: start_time_update[]
  start_time: string
  delay: number
  route_id: string
  vehicle_id: string
  direction_id: number
  timestamp: number
  delay_type: string
  headsign: string
  route_short_name: string
  route_long_name: string
  lon: number
  lat: number
}

export type start_time_update = {
  stop_id: string | null | undefined
  stop_sequence: any
  delay: any
  time: any
}

export type VehicleFeature = {
  id: number
  tripId: string
  stop_time_update: start_time_update[]
  start_time: string
  delay: number
  lat: number
  long: number
  routeId: string
  vehicleId: string
  directionId: number
  timestamp: number
  headsign: string
  route_short_name: string
  route_long_name: string
}

export type StopUpdateType = {
  oid: number
  stop_id: string
  stop_sequence: number
  delay: number
  type: "bus" | "train"
  trip_id: string
  route_id: string
  route_number: string
  direction_id: number
}
