'use client';

import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import html2canvas from 'html2canvas';

interface Keypoint {
  x: number;
  y: number;
  name?: string;
}

export default function PostureApp() {
  // Step 1: 정보입력, Step 2: 정면촬영, Step 3: 정면분석, Step 4: 측면촬영, Step 5: 측면분석, Step 6: 종합 결과지
  const [step, setStep] = useState<number>(1);
  const [userName, setUserName] = useState<string>('최종환');

  // 이미지 및 수치 데이터 저장 State
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [sideImage, setSideImage] = useState<string | null>(null);
  
  const [frontMetrics, setFrontMetrics] = useState({ shoulder: 1.4, hip: 0.2, head: 0.4 });
  const [sideMetrics, setSideMetrics] = useState({ cva: 55.2, headDistance: 13.7, torsoTilt: 7.8 });

  const webcamRef = useRef<Webcam>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // ----------------------------------------------------
  // 측면 촬영 처리 (Step 4 -> Step 5)
  // ----------------------------------------------------
  const handleSideCapture = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setSideImage(imageSrc);
    setStep(5); // 측면 분석으로 이동
  };

  // ----------------------------------------------------
  // 이미지 저장 및 이미지 캡처 다운로드 (Step 6)
  // ----------------------------------------------------
  const handleDownloadReport = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${userName}_자세분석결과지.png`;
    link.click();
  };

  // ----------------------------------------------------
  // 공유하기 (Web Share API)
  // ----------------------------------------------------
  const handleShare = async () => {
    const textData = `[튼튼병원 AI 자세분석 결과]\n${userName} 님 - ${new Date().toLocaleDateString()}\n\n▶ 정면 측정\n- 어깨 기울기: ${frontMetrics.shoulder}°\n- 골반 기울기: ${frontMetrics.hip}°\n\n▶ 측면 측정\n- 목 전방각(CVA): ${sideMetrics.cva}°\n- 머리 전방 이동: ${sideMetrics.headDistance}cm`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: '자세 분석 결과지',
          text: textData,
          url: window.location.href,
        });
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
      
      {/* (이전 Step 1~3 영역 생략 - Step 3 하단 버튼에서 Step 4로 이동) */}
      
      {step === 3 && (
        <button
          onClick={() => setStep(4)}
          style={{ width: '100%', padding: '14px', backgroundColor: '#1e40af', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}
        >
          결과지 생성 → 측면 촬영
        </button>
      )}

      {/* ------------------ STEP 4: 측면 촬영 ------------------ */}
      {step === 4 && (
        <div>
          <button onClick={() => setStep(3)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px' }}>
            ← 이전으로
          </button>
          <h3 style={{ color: '#1e3a8a', marginBottom: '16px' }}>측면 촬영 — {userName}님</h3>
          <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '2px solid #ddd' }}>
            <Webcam ref={webcamRef} screenshotFormat="image/jpeg" style={{ width: '100%', display: 'block' }} />
          </div>
          <button
            onClick={handleSideCapture}
            style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}
          >
            즉시 촬영
          </button>
        </div>
      )}

      {/* ------------------ STEP 5: 측면 분석 ------------------ */}
      {step === 5 && (
        <div>
          <h3 style={{ color: '#1e3a8a', marginBottom: '12px' }}>측면 분석 — {userName}님</h3>
          {sideImage && <img src={sideImage} alt="Side" style={{ width: '100%', borderRadius: '16px' }} />}
          
          <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>측정 수치</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>목 전방각 (CVA)</span>
              <strong>{sideMetrics.cva}° (관리필요)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>머리 전방 이동</span>
              <strong>{sideMetrics.headDistance} cm (관리필요)</strong>
            </div>
          </div>

          <button
            onClick={() => setStep(6)}
            style={{ width: '100%', padding: '14px', backgroundColor: '#1e40af', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', marginTop: '16px', cursor: 'pointer' }}
          >
            최종 결과지 보기 →
          </button>
        </div>
      )}

      {/* ------------------ STEP 6: 최종 종합 결과지 및 공유 ------------------ */}
      {step === 6 && (
        <div>
          <button onClick={() => setStep(1)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '12px' }}>
            ← 처음으로 (새 참가자)
          </button>

          {/* 결과지 인쇄/캡처 영역 */}
          <div ref={reportRef} style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
            <h2 style={{ color: '#1e3a8a', textAlign: 'center', marginBottom: '4px' }}>튼튼병원</h2>
            <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', margin: '0 0 16px 0' }}>AI 자세분석 결과지</p>

            {/* 정면 결과 요약 */}
            <div style={{ border: '1px solid #eee', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#2563eb' }}>① 정면 결과지 ({userName} 님)</h4>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>어깨 기울기: <strong>{frontMetrics.shoulder}° (양호)</strong></p>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>골반 기울기: <strong>{frontMetrics.hip}° (양호)</strong></p>
            </div>

            {/* 측면 결과 요약 */}
            <div style={{ border: '1px solid #eee', padding: '12px', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#2563eb' }}>② 측면 결과지 ({userName} 님)</h4>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>목 전방각(CVA): <strong style={{ color: '#dc2626' }}>{sideMetrics.cva}° (관리필요)</strong></p>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>머리 전방 이동: <strong style={{ color: '#dc2626' }}>{sideMetrics.headDistance} cm (관리필요)</strong></p>
            </div>
          </div>

          {/* 하단 공유 및 저장 버튼 그룹 */}
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={handleShare}
              style={{ padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
            >
              공유하기 (카카오톡 등)
            </button>
            <button
              onClick={handleDownloadReport}
              style={{ padding: '14px', backgroundColor: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
            >
              이미지 저장
            </button>
          </div>
        </div>
      )}

    </div>
  );
}