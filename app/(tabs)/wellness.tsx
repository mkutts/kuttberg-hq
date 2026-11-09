import { TabPlaceholder } from '../../src/components/TabPlaceholder';
import { destinations } from '../../src/destinations';

export default function WellnessScreen() {
  return <TabPlaceholder {...destinations.wellness} />;
}
