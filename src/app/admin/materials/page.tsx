import type { Metadata } from "next";
import MaterialsClient from "./MaterialsClient";

export const metadata: Metadata = {
  title: "Materials | MDP Tracker",
};

export default function MaterialsPage() {
  return <MaterialsClient />;
}
