import LineItemSearchClient from "./LineItemSearchClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Line Item Search | MDP Tracker",
};

export default function LineItemSearchPage() {
  return <LineItemSearchClient />;
}
