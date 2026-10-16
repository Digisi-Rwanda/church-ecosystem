import { Navigate, useParams, useSearchParams } from 'react-router-dom';

/** The old one-page form is gone: a new activity is made in the three-step flow. */
export function ActivityNew() {
  const { systemId = '' } = useParams();
  const [query] = useSearchParams();
  const kind = (query.get('kind') ?? 'event').toLowerCase();
  return <Navigate to={`/s/${systemId}/money/plan/new/${kind}`} replace />;
}
