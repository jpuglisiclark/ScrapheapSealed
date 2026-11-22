import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setIdentity } from '../identity.ts';

/** Restores a player's identity from a resume link (identity lives in the URL fragment). */
export default function Resume() {
  const { poolId = '' } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    try {
      const id = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      if (id?.deckId && id?.token) setIdentity(poolId, id);
    } catch {
      /* bad link: fall through to the lobby */
    }
    nav(`/p/${poolId}`, { replace: true });
  }, [poolId, nav]);
  return <main className="page">Restoring your deck…</main>;
}
