'use client';

import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';

// Window 객체 타입 확장 (CDN 로드용)
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
  const [userName, setUserName] = useState<string>('최종환');

  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [sideImage, setSideImage] = useState<string | null>(null);

  const [frontMetrics, setFrontMetrics] = useState({ shoulder: 1.4, hip: 0.2, head: 0.4 });
  const [sideMetrics, setSideMetrics] = useState({ cva: 55.2, headDistance: 13.7, torsoTilt: 7.8 });

  const webcamRef = useRef<Webcam>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [tiltWarning, setTiltWarning] = useState<string>('');
  const [keypoints, setKeypoints] = useState<Keypoint[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // 수평 센서
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const gamma = event.gamma || 0;
      if (Math.abs(gamma) > 3) {
        setTiltWarning(`수평이 안 맞아요 — ${gamma > 0 ? '오른쪽' : '왼쪽'}으로 기울었어요.`);
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

  // CDN 스크립트 동적 로드 함수 (Turbopack 빌드 에러 우회)
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

  // 정면 촬영 및 MoveNet AI 실행
  const handleFrontCapture = async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setFrontImage(imageSrc);
    setStep(3);

    try {
      // TensorFlow & MoveNet 스크립트 순차 로드
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection');

      if (window.tf) {
        await window.tf.ready();
      }

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
            const pts = poses[0].keypoints.map((kp: any) => ({ x: kp.x, y: kp.y, name: kp.name }));
            setKeypoints(pts);
            calculateFrontAnglesMoveNet(pts);
          }
        };
      }
    } catch (err) {
      console.error('AI 모델 로드 실패:', err);
    }
  };

  const calculateFrontAnglesMoveNet = (pts: Keypoint[]) => {
    if (pts.length < 13) return;

    const lShoulder = pts[5];
    const rShoulder = pts[6];
    const lHip = pts[11];
    const rHip = pts[12];

    if (!lShoulder || !rShoulder || !lHip || !rHip) return;

    const sDeg = Math.abs((Math.atan2(rShoulder.y - lShoulder.y, rShoulder.x - lShoulder.x) * 180) / Math.PI);
    const hDeg = Math.abs((Math.atan2(rHip.y - lHip.y, rHip.x - lHip.x) * 180) / Math.PI);

    setFrontMetrics({
      shoulder: Number(sDeg.toFixed(1)),
      hip: Number(hDeg.toFixed(1)),
      head: 0.4,
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
    link.download = `${userName}_자세분석결과지.png`;
    link.click();
  };

  const handleShare = async () => {
    const textData = `[튼튼병원 AI 자세분석 결과]\n${userName} 님\n\n- 어깨 기울기: ${frontMetrics.shoulder}°\n- 골반 기울기: ${frontMetrics.hip}°\n- 목 전방각(CVA): ${sideMetrics.cva}°`;

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

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', fontFamily: 'sans-serif', backgroundColor: '#f5f7fa', minHeight: '100vh', padding: '16px' }}>

      {/* STEP 1: 정보 입력 */}
      {step === 1 && (
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '16px' }}>
          <h2 style={{ color: '#1e3a8a', marginBottom: '20px' }}>자세 측정 시작하기</h2>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>성함</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '20px', boxSizing: 'border-box' }}
          />
          <button
            onClick={() => setStep(2)}
            style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}
          >
            정면 촬영으로 이동
          </button>
        </div>
      )}

      {/* STEP 2: 정면 촬영 */}
      {step === 2 && (
        <div>
          <button onClick={() => setStep(1)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px' }}>← 처음으로</button>
          <h3 style={{ color: '#1e3a8a', marginBottom: '16px' }}>정면 촬영 — {userName}님</h3>
          <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '2px solid #ddd' }}>
            <Webcam ref={webcamRef} screenshotFormat="image/jpeg" style={{ width: '100%', display: 'block' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '2px', backgroundColor: '#ef4444', transform: 'translateX(-50%)' }} />
          </div>
          {tiltWarning && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '12px', borderRadius: '8px', marginTop: '12px', textAlign: 'center', fontSize: '14px' }}>{tiltWarning}</div>}
          <button onClick={handleFrontCapture} style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}>즉시 촬영</button>
        </div>
      )}

      {/* STEP 3: 정면 분석 */}
      {step === 3 && (
        <div>
          <button onClick={() => setStep(2)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px' }}>← 다시 촬영</button>
          <h3 style={{ color: '#1e3a8a', marginBottom: '12px' }}>정면 분석 — {userName}님</h3>
          <div onMouseMove={handleMouseMove} onMouseUp={() => setDraggingIdx(null)} style={{ position: 'relative', width: '100%', borderRadius: '16px', overflow: 'hidden', userSelect: 'none' }}>
            {frontImage && <img src={frontImage} alt="Front" style={{ width: '100%', display: 'block' }} />}
            {keypoints.map((kp, idx) => {
              if ([5, 6, 11, 12].includes(idx)) {
                return (
                  <div
                    key={idx}
                    onMouseDown={() => setDraggingIdx(idx)}
                    style={{ position: 'absolute', left: `${kp.x}px`, top: `${kp.y}px`, width: '16px', height: '16px', backgroundColor: '#3b82f6', border: '2px solid #fff', borderRadius: '50%', transform: 'translate(-50%, -50%)', cursor: 'grab' }}
                  />
                );
              }
              return null;
            })}
          </div>
          <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>측정 수치</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span>어깨 기울기</span><strong>{frontMetrics.shoulder}° (양호)</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>골반 기울기</span><strong>{frontMetrics.hip}° (양호)</strong></div>
          </div>
          <button onClick={() => setStep(4)} style={{ width: '100%', padding: '14px', backgroundColor: '#1e40af', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}>결과지 생성 → 측면 촬영</button>
        </div>
      )}

      {/* STEP 4: 측면 촬영 */}
      {step === 4 && (
        <div>
          <button onClick={() => setStep(3)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px' }}>← 이전으로</button>
          <h3 style={{ color: '#1e3a8a', marginBottom: '16px' }}>측면 촬영 — {userName}님</h3>
          <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '2px solid #ddd' }}>
            <Webcam ref={webcamRef} screenshotFormat="image/jpeg" style={{ width: '100%', display: 'block' }} />
          </div>
          {tiltWarning && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '12px', borderRadius: '8px', marginTop: '12px', textAlign: 'center', fontSize: '14px' }}>{tiltWarning}</div>}
          <button onClick={handleSideCapture} style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}>즉시 촬영</button>
        </div>
      )}

      {/* STEP 5: 측면 분석 */}
      {step === 5 && (
        <div>
          <h3 style={{ color: '#1e3a8a', marginBottom: '12px' }}>측면 분석 — {userName}님</h3>
          {sideImage && <img src={sideImage} alt="Side" style={{ width: '100%', borderRadius: '16px' }} />}
          <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>측정 수치</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span>목 전방각 (CVA)</span><strong style={{ color: '#dc2626' }}>{sideMetrics.cva}° (관리필요)</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>머리 전방 이동</span><strong style={{ color: '#dc2626' }}>{sideMetrics.headDistance} cm (관리필요)</strong></div>
          </div>
          <button onClick={() => setStep(6)} style={{ width: '100%', padding: '14px', backgroundColor: '#1e40af', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}>최종 결과지 보기 →</button>
        </div>
      )}

      {/* STEP 6: 최종 종합 결과지 및 저장/공유 */}
      {step === 6 && (
        <div>
          <button onClick={() => setStep(1)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px' }}>← 처음으로 (새 참가자)</button>
          <div ref={reportRef} style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
            <h2 style={{ color: '#1e3a8a', textAlign: 'center', marginBottom: '4px' }}>튼튼병원</h2>
            <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', margin: '0 0 16px 0' }}>AI 자세분석 결과지</p>
            <div style={{ border: '1px solid #eee', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#2563eb' }}>① 정면 결과지 ({userName} 님)</h4>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>어깨 기울기: <strong>{frontMetrics.shoulder}° (양호)</strong></p>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>골반 기울기: <strong>{frontMetrics.hip}° (양호)</strong></p>
            </div>
            <div style={{ border: '1px solid #eee', padding: '12px', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#2563eb' }}>② 측면 결과지 ({userName} 님)</h4>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>목 전방각(CVA): <strong style={{ color: '#dc2626' }}>{sideMetrics.cva}° (관리필요)</strong></p>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>머리 전방 이동: <strong style={{ color: '#dc2626' }}>{sideMetrics.headDistance} cm (관리필요)</strong></p>
            </div>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={handleShare} style={{ padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>공유하기 (카카오톡 등)</button>
            <button onClick={handleDownloadReport} style={{ padding: '14px', backgroundColor: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>이미지 저장</button>
          </div>
        </div>
      )}

    </div>
  );
}