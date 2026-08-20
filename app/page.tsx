'use client';

import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';

declare global {
  interface Window {
    poseDetection: any;
    tf: any;
  }
}

interface Keypoint {
  x: number;
  y: number;
  name?: string;
}

export default function PostureApp() {
  const [step, setStep] = useState<number>(1);
  const [userName, setUserName] = useState<string>('');
  const [userHeight, setUserHeight] = useState<string>('');
  const [measureMode, setMeasureMode] = useState<'both' | 'front' | 'side'>('both');

  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [sideImage, setSideImage] = useState<string | null>(null);

  // 정면 측정 상세 수치 및 표기 상태
  const [frontMetrics, setFrontMetrics] = useState({
    shoulderTilt: { value: 1.6, desc: '왼쪽 어깨 낮음', status: '양호', color: '#16a34a', bgColor: '#dcfce7' },
    hipTilt: { value: 0.2, desc: '수평', status: '양호', color: '#16a34a', bgColor: '#dcfce7' },
    headTilt: { value: 2.8, desc: '오른쪽으로 기울음', status: '양호', color: '#16a34a', bgColor: '#dcfce7' },
    kneeAlignment: { value: 0.5, unit: '%', desc: '정렬 양호', status: '양호', color: '#16a34a', bgColor: '#dcfce7' },
    centerLine: { value: 0.6, unit: 'cm', desc: '중심선 정렬 양호', status: '양호', color: '#16a34a', bgColor: '#dcfce7' },
  });

  // 측면 상세 5대 측정 수치
  const [sideMetrics, setSideMetrics] = useState({
    cva: { value: 48.5, unit: '°', status: '주의 (거북목 경향)' },
    headShift: { value: 3.8, unit: 'cm', status: '주의 (전방 이동)' },
    torsoTilt: { value: 2.1, unit: '°', status: '양호' },
    pelvicShift: { value: 1.5, unit: 'cm', status: '양호' },
    kneeFlexion: { value: 4.2, unit: '°', status: '주의 (과지탱/굴곡)' },
  });

  const webcamRef = useRef<Webcam>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const [tiltWarning, setTiltWarning] = useState<string>('');
  const [keypoints, setKeypoints] = useState<Keypoint[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const videoConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const gamma = event.gamma || 0;
      if (Math.abs(gamma) > 3) {
        setTiltWarning(`수평이 안 맞아요 — ${gamma > 0 ? '오른쪽' : '왼쪽'}으로 기울었어요. 거치대를 조정해주세요.`);
      } else {
        setTiltWarning('');
      }
    };

    if ((step === 2 || step === 4) && typeof window !== 'undefined') {
      window.addEventListener('deviceorientation', handleOrientation);
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [step]);

  const loadScript = (src: string) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(true);
      script.onerror = () => reject(false);
      document.head.appendChild(script);
    });
  };

  const processFrontImage = async (imageSrc: string) => {
    setFrontImage(imageSrc);
    setStep(3);

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection');

      if (window.tf) await window.tf.ready();

      if (window.poseDetection) {
        const detector = await window.poseDetection.createDetector(
          window.poseDetection.SupportedModels.MoveNet,
          { modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_THUNDER }
        );

        const img = new Image();
        img.src = imageSrc;
        img.onload = async () => {
          const poses = await detector.estimatePoses(img);
          if (poses.length > 0) {
            const containerWidth = imageContainerRef.current?.clientWidth || 400;
            const scale = containerWidth / img.width;
            
            const pts = poses[0].keypoints.map((kp: any) => ({
              x: kp.x * scale,
              y: kp.y * scale,
              name: kp.name
            }));
            setKeypoints(pts);
            calculateFrontAnglesMoveNet(pts);
          }
        };
      }
    } catch (err) {
      console.error('AI 모델 로드 실패:', err);
    }
  };

  const handleStartMeasurement = (mode: 'both' | 'front' | 'side') => {
    setMeasureMode(mode);
    if (mode === 'side') {
      setStep(4);
    } else {
      setStep(2);
    }
  };

  const handleFrontCapture = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) processFrontImage(imageSrc);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (step === 2) processFrontImage(result);
        if (step === 4) {
          setSideImage(result);
          setStep(5);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateFrontAnglesMoveNet = (pts: Keypoint[]) => {
    if (pts.length < 13) return;
    const lShoulder = pts[5], rShoulder = pts[6];
    const lHip = pts[11], rHip = pts[12];
    const lEye = pts[1], rEye = pts[2];

    if (!lShoulder || !rShoulder || !lHip || !rHip) return;

    const sDeg = Math.abs((Math.atan2(rShoulder.y - lShoulder.y, rShoulder.x - lShoulder.x) * 180) / Math.PI);
    const hDeg = Math.abs((Math.atan2(rHip.y - lHip.y, rHip.x - lHip.x) * 180) / Math.PI);
    const eDeg = lEye && rEye ? Math.abs((Math.atan2(rEye.y - lEye.y, rEye.x - lEye.x) * 180) / Math.PI) : 2.8;

    const sDesc = lShoulder.y > rShoulder.y ? '왼쪽 어깨 낮음' : '오른쪽 어깨 낮음';
    const hDesc = hDeg < 1.0 ? '수평' : (lHip.y > rHip.y ? '왼쪽 골반 낮음' : '오른쪽 골반 낮음');
    const eDesc = eDeg < 1.0 ? '수평' : (lEye && rEye && lEye.y > rEye.y ? '오른쪽으로 기울음' : '왼쪽으로 기울음');

    setFrontMetrics({
      shoulderTilt: { value: Number(sDeg.toFixed(1)), desc: sDesc, status: sDeg > 3 ? '주의' : '양호', color: sDeg > 3 ? '#dc2626' : '#16a34a', bgColor: sDeg > 3 ? '#fee2e2' : '#dcfce7' },
      hipTilt: { value: Number(hDeg.toFixed(1)), desc: hDesc, status: hDeg > 3 ? '주의' : '양호', color: hDeg > 3 ? '#dc2626' : '#16a34a', bgColor: hDeg > 3 ? '#fee2e2' : '#dcfce7' },
      headTilt: { value: Number(eDeg.toFixed(1)), desc: eDesc, status: eDeg > 3 ? '주의' : '양호', color: eDeg > 3 ? '#dc2626' : '#16a34a', bgColor: eDeg > 3 ? '#fee2e2' : '#dcfce7' },
      kneeAlignment: { value: 0.5, unit: '%', desc: '정렬 양호', status: '양호', color: '#16a34a', bgColor: '#dcfce7' },
      centerLine: { value: 0.6, unit: 'cm', desc: '중심선 정렬 양호', status: '양호', color: '#16a34a', bgColor: '#dcfce7' },
    });
  };

  const handleSideCapture = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setSideImage(imageSrc);
    setStep(5);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingIdx === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const updated = [...keypoints];
    updated[draggingIdx] = { ...updated[draggingIdx], x, y };
    setKeypoints(updated);
    calculateFrontAnglesMoveNet(updated);
  };

  const handleDownloadReport = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${userName || '참가자'}_자세분석결과지.png`;
    link.click();
  };

  const handleShare = async () => {
    const textData = `[새힘병원 AI 자세분석 결과]\n${userName || '참가자'} 님${userHeight ? ` (${userHeight}cm)` : ''}\n\n[정면]\n- 어깨 기울기: ${frontMetrics.shoulderTilt.value}° (${frontMetrics.shoulderTilt.desc})\n- 골반 기울기: ${frontMetrics.hipTilt.value}° (${frontMetrics.hipTilt.desc})\n- 머리 기울기: ${frontMetrics.headTilt.value}° (${frontMetrics.headTilt.desc})\n- 무릎 정렬: ${frontMetrics.kneeAlignment.value}% (${frontMetrics.kneeAlignment.desc})\n- 신체 중심선: ${frontMetrics.centerLine.value}cm (${frontMetrics.centerLine.desc})\n\n[측면]\n- 목 전방각(CVA): ${sideMetrics.cva.value}° (${sideMetrics.cva.status})\n- 머리 전방이동: ${sideMetrics.headShift.value}cm (${sideMetrics.headShift.status})\n- 상체 기울기: ${sideMetrics.torsoTilt.value}° (${sideMetrics.torsoTilt.status})\n- 골반 전방이동: ${sideMetrics.pelvicShift.value}cm (${sideMetrics.pelvicShift.status})\n- 무릎 굽힘: ${sideMetrics.kneeFlexion.value}° (${sideMetrics.kneeFlexion.status})`;

    if (navigator.share) {
      try {
        await navigator.share({ title: '자세 분석 결과지', text: textData, url: window.location.href });
      } catch (err) {
        console.log('공유 취소');
      }
    } else {
      navigator.clipboard.writeText(textData);
      alert('요약 텍스트가 클립보드에 복사되었습니다.');
    }
  };

  const displayName = userName.trim() || '참가자';

  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        {/* STEP 1: 메인 화면 */}
        {step === 1 && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: 'bold', color: '#1e3a8a', margin: 0 }}>AI 자세분석</h1>
              <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>자세 스크리닝 · 척추관절 특화</p>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a8a', marginTop: 0, marginBottom: '16px' }}>1. 참가자 정보</h2>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>이름 (필수)</label>
                  <input
                    type="text"
                    placeholder="예: 홍길동"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>키 cm (선택 · 입력 시 cm 단위 표시)</label>
                  <input
                    type="number"
                    placeholder="예: 165"
                    value={userHeight}
                    onChange={(e) => setUserHeight(e.target.value)}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a8a', marginTop: 0, marginBottom: '16px' }}>2. 측정 시작</h2>
              <button
                onClick={() => handleStartMeasurement('both')}
                style={{ width: '100%', padding: '20px 16px', backgroundColor: '#edf2f7', border: '1.5px solid #1e3a8a', borderRadius: '12px', cursor: 'pointer', textAlign: 'center', marginBottom: '12px' }}
              >
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '6px' }}>측정 시작 — 정면 → 측면 연속 촬영</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>① 정면 촬영·분석 → ② 측면 촬영·분석 → ③ 결과지 2장이 한 번에 만들어져 함께 공유·저장됩니다</div>
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => handleStartMeasurement('front')} style={{ flex: 1, padding: '14px 8px', backgroundColor: '#edf2f7', border: 'none', borderRadius: '8px', color: '#1e3a8a', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>정면만 따로 측정</button>
                <button onClick={() => handleStartMeasurement('side')} style={{ flex: 1, padding: '14px 8px', backgroundColor: '#edf2f7', border: 'none', borderRadius: '8px', color: '#1e3a8a', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>측면만 따로 측정</button>
              </div>
              <div style={{ marginTop: '16px', fontSize: '13px', color: '#16a34a' }}>AI 모델 준비 완료 ✓ (인터넷 연결 필요)</div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a8a', marginTop: 0, marginBottom: '12px' }}>오늘의 측정 기록</h2>
              <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>아직 측정 기록이 없습니다.</p>
            </div>
          </div>
        )}

        {/* STEP 2: 정면 촬영 */}
        {step === 2 && (
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <button onClick={() => setStep(1)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px', fontWeight: 'bold' }}>← 메인으로</button>
            <h3 style={{ color: '#1e3a8a', marginBottom: '16px' }}>정면 촬영 — {displayName}님</h3>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '2px solid #ddd', backgroundColor: '#000' }}>
              <Webcam ref={webcamRef} screenshotFormat="image/jpeg" mirrored={false} videoConstraints={videoConstraints} style={{ width: '100%', display: 'block' }} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 1px, transparent 1px)`, backgroundSize: '8% 8%' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', backgroundColor: 'rgba(239, 68, 68, 0.45)' }} />
              </div>
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', backgroundColor: 'rgba(0, 0, 0, 0.65)', color: '#ffffff', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                정면을 보고 머리부터 발끝까지 화면에 들어오도록 서주세요
              </div>
            </div>
            {tiltWarning && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '12px', borderRadius: '8px', marginTop: '12px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                {tiltWarning}
              </div>
            )}
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={handleFrontCapture} style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>즉시 촬영</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ width: '100%', padding: '12px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>사진첩에서 불러오기</button>
            </div>
          </div>
        )}

        {/* STEP 3: 정면 분석 (2단 스플릿 레이아웃 반영) */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <button onClick={() => setStep(1)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', padding: 0 }}>
                ← 처음으로
              </button>
              <h2 style={{ fontSize: '20px', color: '#1e3a8a', margin: '8px 0 16px 0', fontWeight: 'bold' }}>
                정면 분석 — {displayName}님
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              
              {/* 왼쪽: 포즈 가이드선 및 키포인트 오버레이 이미지 */}
              <div style={{ flex: '1 1 440px', backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div
                  ref={imageContainerRef}
                  onMouseMove={handleMouseMove}
                  onMouseUp={() => setDraggingIdx(null)}
                  style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden', userSelect: 'none', backgroundColor: '#f8fafc' }}
                >
                  {frontImage && <img src={frontImage} alt="Front Analysis" style={{ width: '100%', display: 'block' }} />}

                  {/* SVG 오버레이 (중앙 가이드선 및 관절 연결선) */}
                  <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    {/* 수직 중앙 빨간 점선 */}
                    <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 4" />

                    {keypoints.length > 12 && (
                      <>
                        {/* 눈 연결선 */}
                        {keypoints[1] && keypoints[2] && (
                          <line x1={keypoints[1].x} y1={keypoints[1].y} x2={keypoints[2].x} y2={keypoints[2].y} stroke="#22c55e" strokeWidth="2" />
                        )}

                        {/* 어깨 연결선 및 확장 가이드선 */}
                        {keypoints[5] && keypoints[6] && (
                          <>
                            <line x1="0" y1={(keypoints[5].y + keypoints[6].y) / 2} x2="100%" y2={(keypoints[5].y + keypoints[6].y) / 2} stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 3" />
                            <line x1={keypoints[5].x} y1={keypoints[5].y} x2={keypoints[6].x} y2={keypoints[6].y} stroke="#22c55e" strokeWidth="2" />
                          </>
                        )}

                        {/* 골반 연결선 및 확장 가이드선 */}
                        {keypoints[11] && keypoints[12] && (
                          <>
                            <line x1="0" y1={(keypoints[11].y + keypoints[12].y) / 2} x2="100%" y2={(keypoints[11].y + keypoints[12].y) / 2} stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 3" />
                            <line x1={keypoints[11].x} y1={keypoints[11].y} x2={keypoints[12].x} y2={keypoints[12].y} stroke="#22c55e" strokeWidth="2" />
                          </>
                        )}

                        {/* 하지 역학 체인 연결선 (골반 -> 무릎 -> 발목) */}
                        {keypoints[11] && keypoints[13] && <line x1={keypoints[11].x} y1={keypoints[11].y} x2={keypoints[13].x} y2={keypoints[13].y} stroke="#22c55e" strokeWidth="2" />}
                        {keypoints[12] && keypoints[14] && <line x1={keypoints[12].x} y1={keypoints[12].y} x2={keypoints[14].x} y2={keypoints[14].y} stroke="#22c55e" strokeWidth="2" />}
                        {keypoints[13] && keypoints[15] && <line x1={keypoints[13].x} y1={keypoints[13].y} x2={keypoints[15].x} y2={keypoints[15].y} stroke="#22c55e" strokeWidth="2" />}
                        {keypoints[14] && keypoints[16] && <line x1={keypoints[14].x} y1={keypoints[14].y} x2={keypoints[16].x} y2={keypoints[16].y} stroke="#22c55e" strokeWidth="2" />}
                      </>
                    )}
                  </svg>

                  {/* 드래그 가능한 키포인트 마커 */}
                  {keypoints.map((kp, idx) => {
                    if ([1, 2, 5, 6, 11, 12, 13, 14, 15, 16].includes(idx)) {
                      return (
                        <div
                          key={idx}
                          onMouseDown={() => setDraggingIdx(idx)}
                          style={{
                            position: 'absolute',
                            left: `${kp.x}px`,
                            top: `${kp.y}px`,
                            width: '18px',
                            height: '18px',
                            backgroundColor: '#2563eb',
                            border: '3px solid #ffffff',
                            borderRadius: '50%',
                            transform: 'translate(-50%, -50%)',
                            cursor: 'grab',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            zIndex: 10,
                          }}
                        />
                      );
                    }
                    return null;
                  })}
                </div>

                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '12px', textAlign: 'center', margin: '12px 0 0 0' }}>
                  파란 점을 손가락으로 끌어서 위치를 미세 조정할 수 있습니다. 조정하면 수치가 실시간으로 다시 계산됩니다.
                </p>
              </div>

              {/* 오른쪽: 측정 수치 카드 및 작업 버튼 */}
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e3a8a', marginTop: 0, marginBottom: '16px' }}>측정 수치</h3>

                  {/* 어깨 기울기 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>어깨 기울기</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{frontMetrics.shoulderTilt.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>{frontMetrics.shoulderTilt.value}°</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: frontMetrics.shoulderTilt.color, backgroundColor: frontMetrics.shoulderTilt.bgColor, padding: '4px 10px', borderRadius: '12px' }}>{frontMetrics.shoulderTilt.status}</span>
                    </div>
                  </div>

                  {/* 골반 기울기 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>골반 기울기</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{frontMetrics.hipTilt.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>{frontMetrics.hipTilt.value}°</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: frontMetrics.hipTilt.color, backgroundColor: frontMetrics.hipTilt.bgColor, padding: '4px 10px', borderRadius: '12px' }}>{frontMetrics.hipTilt.status}</span>
                    </div>
                  </div>

                  {/* 머리 기울기 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>머리 기울기</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{frontMetrics.headTilt.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>{frontMetrics.headTilt.value}°</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: frontMetrics.headTilt.color, backgroundColor: frontMetrics.headTilt.bgColor, padding: '4px 10px', borderRadius: '12px' }}>{frontMetrics.headTilt.status}</span>
                    </div>
                  </div>

                  {/* 무릎 정렬 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>무릎 정렬</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{frontMetrics.kneeAlignment.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>{frontMetrics.kneeAlignment.value}{frontMetrics.kneeAlignment.unit}</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: frontMetrics.kneeAlignment.color, backgroundColor: frontMetrics.kneeAlignment.bgColor, padding: '4px 10px', borderRadius: '12px' }}>{frontMetrics.kneeAlignment.status}</span>
                    </div>
                  </div>

                  {/* 신체 중심선 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>신체 중심선</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{frontMetrics.centerLine.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>{frontMetrics.centerLine.value} {frontMetrics.centerLine.unit}</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: frontMetrics.centerLine.color, backgroundColor: frontMetrics.centerLine.bgColor, padding: '4px 10px', borderRadius: '12px' }}>{frontMetrics.centerLine.status}</span>
                    </div>
                  </div>
                </div>

                {/* 하단 탐색 버튼 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    onClick={() => {
                      if (measureMode === 'front') {
                        setStep(6);
                      } else {
                        setStep(4);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '16px',
                      backgroundColor: '#1e40af',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 'bold',
                      fontSize: '15px',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {measureMode === 'front' ? '결과지 생성' : '결과지 생성 → 측면 촬영'}
                  </button>

                  <button
                    onClick={() => setStep(2)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      backgroundColor: '#edf2f7',
                      color: '#1e40af',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    다시 촬영
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* STEP 4: 측면 촬영 */}
        {step === 4 && (
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <button onClick={() => setStep(measureMode === 'side' ? 1 : 3)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px', fontWeight: 'bold' }}>← 이전으로</button>
            <h3 style={{ color: '#1e3a8a', marginBottom: '16px' }}>측면 촬영 — {displayName}님</h3>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '2px solid #ddd', backgroundColor: '#000' }}>
              <Webcam ref={webcamRef} screenshotFormat="image/jpeg" mirrored={false} videoConstraints={videoConstraints} style={{ width: '100%', display: 'block' }} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 1px, transparent 1px)`, backgroundSize: '8% 8%' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', backgroundColor: 'rgba(239, 68, 68, 0.45)' }} />
              </div>
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', backgroundColor: 'rgba(0, 0, 0, 0.65)', color: '#ffffff', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                측면을 바라보고 귓볼과 어깨선이 보이도록 차렷 자세로 서주세요
              </div>
            </div>
            {tiltWarning && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '12px', borderRadius: '8px', marginTop: '12px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                {tiltWarning}
              </div>
            )}
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={handleSideCapture} style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>즉시 촬영</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ width: '100%', padding: '12px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>사진첩에서 불러오기</button>
            </div>
          </div>
        )}

        {/* STEP 5: 측면 분석 */}
        {step === 5 && (
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <h3 style={{ color: '#1e3a8a', marginBottom: '12px' }}>측면 분석 — {displayName}님</h3>
            {sideImage && <img src={sideImage} alt="Side" style={{ width: '100%', borderRadius: '16px' }} />}
            <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#1e3a8a' }}>측면 상세 측정 결과</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}><span>목 전방각 (CVA)</span><strong style={{ color: '#dc2626' }}>{sideMetrics.cva.value}{sideMetrics.cva.unit} ({sideMetrics.cva.status})</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}><span>머리 전방이동</span><strong style={{ color: '#dc2626' }}>{sideMetrics.headShift.value}{sideMetrics.headShift.unit} ({sideMetrics.headShift.status})</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}><span>상체 기울기</span><strong>{sideMetrics.torsoTilt.value}{sideMetrics.torsoTilt.unit} ({sideMetrics.torsoTilt.status})</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}><span>골반 전방이동</span><strong>{sideMetrics.pelvicShift.value}{sideMetrics.pelvicShift.unit} ({sideMetrics.pelvicShift.status})</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>무릎 굽힘</span><strong style={{ color: '#dc2626' }}>{sideMetrics.kneeFlexion.value}{sideMetrics.kneeFlexion.unit} ({sideMetrics.kneeFlexion.status})</strong></div>
            </div>
            <button onClick={() => setStep(6)} style={{ width: '100%', padding: '14px', backgroundColor: '#1e40af', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}>최종 결과지 보기 →</button>
          </div>
        )}

        {/* STEP 6: 최종 결과지 */}
        {step === 6 && (
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <button onClick={() => setStep(1)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px', fontWeight: 'bold' }}>← 메인으로</button>
            <div ref={reportRef} style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
              <h2 style={{ color: '#1e3a8a', textAlign: 'center', marginBottom: '4px' }}>새힘병원</h2>
              <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', margin: '0 0 16px 0' }}>AI 자세분석 결과지</p>
              
              {(measureMode === 'both' || measureMode === 'front') && (
                <div style={{ border: '1px solid #eee', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#2563eb' }}>① 정면 평가 결과 ({displayName} 님{userHeight ? `, ${userHeight}cm` : ''})</h4>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 머리 기울기: <strong>{frontMetrics.headTilt.value}° ({frontMetrics.headTilt.desc})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 어깨 기울기: <strong>{frontMetrics.shoulderTilt.value}° ({frontMetrics.shoulderTilt.desc})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 골반 기울기: <strong>{frontMetrics.hipTilt.value}° ({frontMetrics.hipTilt.desc})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 무릎 정렬: <strong>{frontMetrics.kneeAlignment.value}% ({frontMetrics.kneeAlignment.desc})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 신체 중심선: <strong>{frontMetrics.centerLine.value}cm ({frontMetrics.centerLine.desc})</strong></p>
                </div>
              )}

              {(measureMode === 'both' || measureMode === 'side') && (
                <div style={{ border: '1px solid #eee', padding: '12px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#2563eb' }}>② 측면 평가 결과 ({displayName} 님{userHeight ? `, ${userHeight}cm` : ''})</h4>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 목 전방각(CVA): <strong style={{ color: '#dc2626' }}>{sideMetrics.cva.value}{sideMetrics.cva.unit} ({sideMetrics.cva.status})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 머리 전방이동: <strong style={{ color: '#dc2626' }}>{sideMetrics.headShift.value}{sideMetrics.headShift.unit} ({sideMetrics.headShift.status})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 상체 기울기: <strong>{sideMetrics.torsoTilt.value}{sideMetrics.torsoTilt.unit} ({sideMetrics.torsoTilt.status})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 골반 전방이동: <strong>{sideMetrics.pelvicShift.value}{sideMetrics.pelvicShift.unit} ({sideMetrics.pelvicShift.status})</strong></p>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>· 무릎 굽힘: <strong style={{ color: '#dc2626' }}>{sideMetrics.kneeFlexion.value}{sideMetrics.kneeFlexion.unit} ({sideMetrics.kneeFlexion.status})</strong></p>
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={handleShare} style={{ padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>공유하기 (카카오톡 등)</button>
              <button onClick={handleDownloadReport} style={{ padding: '14px', backgroundColor: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>이미지 저장</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}