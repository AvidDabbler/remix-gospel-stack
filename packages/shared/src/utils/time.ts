import moment, { Moment, MomentInput } from "moment-timezone";
import { AgencyConfig } from "../types";

export const now = (
  inputDate: MomentInput = null,
  timezone: string
) => {
  const date = inputDate
    ? moment(inputDate).tz(timezone)
    : moment().tz(timezone);

  const month = date.format("MM");
  const day = date.format("DD");
  const year = date.format("YYYY");
  const hour = date.format("HH");

  return {
    date: date.tz(timezone).toDate(),
    time: date
      .tz(timezone)
      .toDate()
      .getTime(),
    epoch: date
      .tz(timezone)
      .toDate()
      .valueOf(),
    year,
    month,
    day,
    hour,
    routeDate: `${year}-${month}-${day}`,
    fileDate: `${year}${month}${day}`,
    humanDate: `${month}-${day}-${year}`,
  };
};

export function calculateSecondsAfterMidnight(config: AgencyConfig, scheduleDate: Moment): number {
  const now = moment().tz(config.timezone)
  const midnight = scheduleDate.startOf("day")
  const secondsAfterMidnight = now.diff(midnight, "seconds")
  return secondsAfterMidnight
}

// export function calculateTimetamp(scheduleDate: string): number {
//   const now = moment()
//   const midnight = scheduleDate.startOf("day")
//   const secondsAfterMidnight = now.diff(midnight, "seconds")
//   return secondsAfterMidnight
// }

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
  const localTime: Date = changeTimeZone(newDate, timezone);
  const utc: Date = changeTimeZone(newDate, "UTC");
  // @ts-ignore-next-line
  return (localTime - utc) / 1000;
};
