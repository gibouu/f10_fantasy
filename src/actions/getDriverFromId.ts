"use server"

import { season } from "@/lib/constants";
import { Driver } from "../../types/f1";

type Props = {
    driverId: string;
}

export default async function getDriverFromId({ driverId }: Props) {

    const res = await fetch(`http://ergast.com/api/f1/${season}/drivers/${driverId}.json`)
   
    if (!res.ok) {
      // This will activate the closest `error.js` Error Boundary
      throw new Error('Failed to fetch data')
    }

    const data = await res.json();
    const driver: Driver = data.MRData.DriverTable.Drivers[0]
   
    return driver
  }