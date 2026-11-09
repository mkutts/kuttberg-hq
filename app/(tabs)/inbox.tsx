import { TabPlaceholder } from '../../src/components/TabPlaceholder';
import { destinations } from '../../src/destinations';

export default function InboxScreen() {
  return <TabPlaceholder {...destinations.inbox} />;
}
