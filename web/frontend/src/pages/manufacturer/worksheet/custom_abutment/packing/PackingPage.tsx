import { PackingPageContent } from "./components/PackingPageContent";

export const PackingPage = ({
  showQueueBar = true,
}: {
  showQueueBar?: boolean;
}) => {
  return <PackingPageContent showQueueBar={showQueueBar} />;
};
