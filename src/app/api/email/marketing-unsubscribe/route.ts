import { forwardOneClick } from '@/lib/api/one-click';
export const POST = (request: Request) => forwardOneClick(request, 'marketing/one-click', ['c']);
