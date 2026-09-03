const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type LaborReviewPeriod = {
  startDate: string;
  endDate: string;
  label: string;
  fileKey: string;
};

export function parseLaborReviewPeriod(startDate: string | null | undefined, endDate: string | null | undefined): LaborReviewPeriod {
  if (!startDate || !endDate || !ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || startDate > endDate) {
    throw new Error("A valid labor review start and end date are required.");
  }

  const [year, month, day] = startDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isFullMonth = day === 1 && endDate === `${startDate.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;

  return {
    startDate,
    endDate,
    label: isFullMonth ? `${MONTH_NAMES[month - 1]} ${year}` : `${startDate} to ${endDate}`,
    fileKey: `${startDate}_to_${endDate}`,
  };
}
