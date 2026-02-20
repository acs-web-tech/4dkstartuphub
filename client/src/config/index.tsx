
import { Briefcase, Users, Megaphone, HelpCircle, Calendar, MessageSquare, FileText, LucideIcon } from 'lucide-react';
import { PostCategory } from '../types';

export const CATEGORY_CONFIG: Record<PostCategory, { label: string; icon: LucideIcon; color: string }> = {
    hiring: { label: 'Careers & Talent', icon: Briefcase, color: '#4ade80' },
    cofounder: { label: 'Partner Search', icon: Users, color: '#f472b6' },
    promote: { label: 'Showcase & Launch', icon: Megaphone, color: '#60a5fa' },
    recommendation: { label: 'Advice & Suggestions', icon: HelpCircle, color: '#fbbf24' },
    events: { label: 'Meetups & Happenings', icon: Calendar, color: '#a78bfa' },
    general: { label: 'Open Discussion', icon: MessageSquare, color: '#94a3b8' },
    writeup: { label: 'Insights & Stories', icon: FileText, color: '#fb923c' },
    announcements: { label: 'Announcements', icon: Megaphone, color: '#f87171' },
};
