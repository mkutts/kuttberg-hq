import { TabPlaceholder } from '../../src/components/TabPlaceholder';
import { destinations } from '../../src/destinations';

export default function RoutinesScreen() {
  return <TabPlaceholder {...destinations.routines} />;
}
