import { redirect } from 'next/navigation';

/**
 * /conversations foi consolidado em /omnichannel.
 * Mantido como redirect por 1 release para não quebrar bookmarks.
 */
export default function ConversationsRedirect() {
  redirect('/omnichannel');
}
