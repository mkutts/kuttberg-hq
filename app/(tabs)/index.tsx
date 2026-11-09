import { TabPlaceholder } from '../../src/components/TabPlaceholder';
import { destinations } from '../../src/destinations';

export default function TodayScreen() {
  return <TabPlaceholder {...destinations.index} />;
}
