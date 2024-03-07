"use server"

import { season } from "@/lib/constants"
import { Driver } from "../../types/f1";

export default async function getDrivers() {
    const res = await fetch(`http://ergast.com/api/f1/${season}/drivers.json`)

    if (!res.ok) {
        // This will activate the closest `error.js` Error Boundary
        throw new Error('Failed to fetch data')
      }
  
      const data = await res.json();
      const drivers: Driver[] = data.MRData.DriverTable.Drivers
     
      return drivers
}