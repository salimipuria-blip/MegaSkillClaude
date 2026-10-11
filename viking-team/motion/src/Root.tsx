import React from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

const ORANGE = '#FF713C';
const CREAM = '#F8F3EC';
const BG = '#080B0C';

/** Six-second cinematic motion study for the Viking app's entry and hero transitions.
 * The orb is a motion language reference, not a replacement for task controls.
 * No CSS animations or transitions: every visual state is deterministic per frame.
 */
export const VikingCommandIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = interpolate(frame, [0, fps * 0.85], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.18, 0.9, 0.2, 1),
  });
  const content = interpolate(frame, [fps * 1.7, fps * 2.55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const bottom = interpolate(frame, [fps * 3.1, fps * 3.8], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const pulse = Math.sin((frame / fps) * Math.PI * 0.86);
  const drift = Math.sin((frame / fps) * Math.PI * 0.35);

  return (
    <AbsoluteFill style={{background: BG, color: CREAM, overflow: 'hidden', fontFamily: 'Arial, Tahoma, sans-serif'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 53% 42%,#27352C 0%,#101818 35%,#080B0C 77%)', opacity: enter}} />
      <div style={{position: 'absolute', top: 112, left: 88, right: 88, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: enter}}>
        <span style={{fontWeight: 800, fontSize: 24, color: ORANGE, letterSpacing: 3}}>V / COMMAND</span>
        <span style={{fontSize: 18, letterSpacing: 2, color: '#B6C1BA'}}>EST. EXPERIENCE FIRST</span>
      </div>
      <div style={{position: 'absolute', left: '50%', top: '41%', width: 670, height: 670, translate: '-50% -50%', scale: 0.7 + enter * 0.3 + pulse * 0.027, opacity: enter}}>
        <div style={{position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #51635A', boxShadow: '0 0 140px #FF713C10'}} />
        <div style={{position: 'absolute', inset: 38, borderRadius: '50%', border: '3px solid #B85C3E', rotate: (frame / fps * 5) + 'deg', opacity: 0.78}} />
        <div style={{position: 'absolute', inset: 97, borderRadius: '50%', border: '2px solid #F98B5A', opacity: 0.88}} />
        <div style={{position: 'absolute', inset: 132, borderRadius: '50%', background: 'radial-gradient(circle at 38% 30%,#FFE0B0,#FF8352 30%,#A33F29 76%)', boxShadow: '0 0 120px #FF713C55, inset -22px -30px 65px #61291990', scale: 1 + pulse * 0.09 + drift * 0.035}} />
      </div>
      <div dir="rtl" style={{position: 'absolute', top: 1180, left: 100, right: 100, opacity: content, translate: '0px ' + (1 - content) * 36 + 'px', textAlign: 'right'}}>
        <div style={{fontFamily: 'Arial, Tahoma, sans-serif', color: ORANGE, fontSize: 24, fontWeight: 800, letterSpacing: 3, marginBottom: 28}}>VIKING / FIELD NOTES 001</div>
        <div style={{fontSize: 81, fontWeight: 900, lineHeight: 1.35, letterSpacing: -2}}>سفر، فقط مسیر نیست.</div>
        <div style={{fontSize: 38, lineHeight: 1.8, marginTop: 35, color: '#B7C1B9'}}>هر لحظه را طراحی کن. هر تجربه را ماندگار کن.</div>
      </div>
      <div style={{position: 'absolute', left: 96, right: 96, bottom: 112, opacity: bottom, display: 'flex', alignItems: 'center', gap: 22}}>
        <div style={{height: 2, flex: 1, background: '#53635A'}} />
        <span style={{color: ORANGE, fontSize: 22, letterSpacing: 3, fontWeight: 800}}>THE EXPERIENCE COMMAND</span>
      </div>
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="VikingCommandIntro" component={VikingCommandIntro} durationInFrames={180} fps={30} width={1080} height={1920} />
);
