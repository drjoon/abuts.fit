import { useMemo } from "react";
import type { CaseInfos } from "./newRequestTypes";

const addBusinessDays = (startDate: Date, days: number) => {
  let count = 0;
  const current = new Date(startDate);
  while (count < days) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
  }
  return current;
};

const calculateExpressDate = (maxDiameter?: number) => {
  const today = new Date();

  if (maxDiameter === undefined || maxDiameter <= 8) {
    const shipDate = addBusinessDays(today, 1);
    return shipDate.toISOString().split("T")[0];
  }

  const currentDay = today.getDay();
  const targetDow = 3;

  let daysToAdd = targetDow - currentDay;
  if (currentDay > 1) {
    daysToAdd += 7;
  }
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }

  const shipDate = new Date(today);
  shipDate.setDate(today.getDate() + daysToAdd);
  return shipDate.toISOString().split("T")[0];
};

export function useExpressShipping(caseInfos?: CaseInfos) {
  return useMemo(() => {
    const expressShipDate =
      caseInfos?.shippingMode === "express"
        ? caseInfos?.requestedShipDate ??
          calculateExpressDate(caseInfos?.maxDiameter)
        : calculateExpressDate(caseInfos?.maxDiameter);

    const expressArrivalDate =
      caseInfos?.maxDiameter && expressShipDate
        ? addBusinessDays(new Date(expressShipDate), 1)
            .toISOString()
            .split("T")[0]
        : undefined;

    return {
      calculateExpressDate,
      expressShipDate,
      expressArrivalDate,
    };
  }, [
    caseInfos?.maxDiameter,
    caseInfos?.requestedShipDate,
    caseInfos?.shippingMode,
  ]);
}
