import { AgencyConfig } from "../type"
import { timezoneOffset } from "./time"

export const defaultMissingTrips = (config: AgencyConfig, tripsList: string[], tDate: string) => {
  const offset = timezoneOffset(config.timezone)
  return `
	select 
		t.trip_id, 
		service_id,
		(
			select service_id 
			from trips t
			join (
				select service_id as included_service_id
				from trips t
				) isi on isi.included_service_id = t.service_id 
			) acceptable_service_id, 
		(
			select min(departure_timestamp) + unixepoch('${tDate} 00:00') arrival 
			from stop_times 
			where trip_id=t.trip_id) trip_start_time, 
		(
			select max(departure_timestamp)  + unixepoch('${tDate} 00:00') dep 
			from stop_times 
			where trip_id=t.trip_id) trip_end_time,
		r.route_id, 
		route_long_name
		from trips t
		join stop_times st on st.trip_id = t.trip_id
		join routes r on r.route_id=t.route_id
	where 
		t.trip_id NOT IN (${tripsList})
		${config.excludeList ? `and ${config.excludeList.join(" and ")}` : ""}
		and (unixepoch() - (${offset})) BETWEEN trip_start_time and trip_end_time
		and service_id = acceptable_service_id
		and ((unixepoch() - (${offset})) - trip_start_time) > (10 * 60)
	group by 
			t.trip_id`
}

export const findMaxStopTime = async (config: AgencyConfig) => {
  const query = "select max(arrival_time) as end_time from stop_times"
  const response = await config.query(query)
  return response[0].end_time ?? null
}

export const defaultStopTimeQuery = (
  utcOffset: string,
  tDate: string,
  tripId: string | number,
  stopId: string | number,
  stopSequence: string | number,
) => {
  return `
		select 
			trip_id,
			stop_id,
		departure_time,
		unixepoch('${tDate}') + ${utcOffset} + departure_timestamp as t_departure_timestamp
		from stop_times 
		where trip_id = '${tripId}' AND stop_id = '${stopId}' AND stop_sequence = ${stopSequence}
		ORDER BY departure_timestamp`
}

export const blockStopTimeQuery = (utcOffset: number, tDate: string, tripId: string | number, stopId: string | number) => {
  return `
	SELECT 
		st.*,
		b.block_id
	from (
		select 
			block_id, 
			trip_id
		from trips 
		where trip_id = '${tripId}'
		) as b
	join trips t on t.block_id = b.block_id
	join 
		(select 
			trip_id,
			stop_id,
			departure_time,
			stop_sequence,
			unixepoch('${tDate}') + ${utcOffset} + departure_timestamp as t_departure_timestamp
	from stop_times 
	where stop_id = '${stopId}' ) st on st.trip_id = t.trip_id`
}

export const getTripsFromBlockId = (block_id: string) => {
  return `select trip_id from trips t where block_id = '${block_id}' group by trip_id `
}

export const defaultTripsQuery = `
		select 
			trips.trip_id,
			trips.shape_id, 
			trips.service_id,
			trips.direction_id,
			trips.block_id,
			routes.route_id,
			routes.agency_id,
			routes.route_short_name,
			routes.route_long_name,
			routes.route_desc,
			routes.route_type,
			routes.route_color,
			routes.route_text_color,
			routes.route_sort_order,
				'' as min_headway_minutes,
			tp.start_time,
			tp.end_time
	from trips 
	join routes on routes.route_id = trips.route_id
	join (
		select 
			trip_id,
			max(departure_time) as end_time,
			min(departure_time) as start_time
		from stop_times 
		group by trip_id
	) tp on tp.trip_id = trips.trip_id`
