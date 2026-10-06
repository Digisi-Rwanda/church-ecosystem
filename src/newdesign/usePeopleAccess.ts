import { useParams } from 'react-router-dom';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';

/** Whether the person may change records here: the server decides again on every save. */
export function useCanWritePeople(): boolean {
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  return lettersFor(capabilities, systemId, 'people').includes('W');
}
