import './globals.css';
import {messages} from '../locales/messages';
export const metadata = { title: messages.en.app, description: messages.en.intro, manifest: '/manifest.webmanifest' };
export default function Layout({children}) { return <html lang="en"><body>{children}</body></html>; }
