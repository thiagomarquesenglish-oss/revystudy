import type { CSSProperties } from 'react';
import play from '@/assets/sf-symbols/play.fill.svg';
import plus from '@/assets/sf-symbols/plus.svg';
import ellipsis from '@/assets/sf-symbols/ellipsis.svg';
import back from '@/assets/sf-symbols/chevron.left.svg';
import refresh from '@/assets/sf-symbols/arrow.clockwise.svg';
import trash from '@/assets/sf-symbols/trash.svg';
import pencil from '@/assets/sf-symbols/pencil.svg';
import speaker from '@/assets/sf-symbols/speaker.wave.2.fill.svg';
import pause from '@/assets/sf-symbols/pause.fill.svg';
import cloud from '@/assets/sf-symbols/cloud.fill.svg';
import person from '@/assets/sf-symbols/person.crop.circle.svg';
import logout from '@/assets/sf-symbols/rectangle.portrait.and.arrow.right.svg';
import bulb from '@/assets/sf-symbols/lightbulb.fill.svg';
import flag from '@/assets/sf-symbols/flag.fill.svg';
import xmark from '@/assets/sf-symbols/xmark.svg';
import check from '@/assets/sf-symbols/checkmark.svg';

const symbols = { play, plus, ellipsis, back, refresh, trash, pencil, speaker, pause, cloud, person, logout, bulb, flag, xmark, check };
export type SfIconName = keyof typeof symbols;
export default function SfIcon({ name, className = '', style }: { name: SfIconName; className?: string; style?: CSSProperties }) {
  return <img src={symbols[name]} alt="" aria-hidden="true" className={`sf-symbol-icon object-contain ${className}`} style={style} />;
}
