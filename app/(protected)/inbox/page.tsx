import { redirect } from 'next/navigation';

/**
 * /inbox foi consolidado em /omnichannel.
 * Mantido como redirect por 1 release para não quebrar bookmarks.
 */
export default function InboxRedirect() {
  redirect('/omnichannel');
}
