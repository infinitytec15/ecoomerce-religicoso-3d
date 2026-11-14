import { forwardOneClick } from '@/lib/api/one-click';
export const POST = (request: Request) => forwardOneClick(request, 'newsletter/one-click');
