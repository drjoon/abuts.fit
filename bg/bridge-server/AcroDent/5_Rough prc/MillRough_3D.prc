BEGIN_PROCESS; 공정 이름; 4;
BEGIN_OPERATION; 553; Rough Mill 3D; 0;
   4420; 4420; 2026;  SOURCE; 0; TECHCODETYPE; 2;
   4437; 4437; 0;  SOURCE; 0; TECHCODETYPE; 2;
   Rough5SeamPointX; 6664; 0;  HIDDEN; CAPTION; 실린더 이음 점 Y|실린더 이음 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   LimitAngleBetweenPoints; 6511; 0;  HIDDEN; CAPTION; 두점사이 각도 제한; SOURCE; 1; TECHCODETYPE; 67;
   CollisionDetection; 6630; 0;  CAPTION; 충돌 감지; SOURCE; 1; TECHCODETYPE; 520;
   ReferenceDepthOfCut; 1768; 0.20000000000000001;  HIDDEN; CAPTION; 참조 가공 깊이; SOURCE; 1; TECHCODETYPE; 2;
   StockAllowanceFloors; 272; 0.20000000000000001;  CAPTION; 바닥 가공 여유; SOURCE; 2; TECHCODETYPE; 2;
   PreFinish; 1394; 0;  CAPTION; 사전-정삭; SOURCE; 1; TECHCODETYPE; 67;
   4910; 4910; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4910;;
		:22.5.8
	END_STRING
   4434; 4434; 0;  SOURCE; 0; TECHCODETYPE; 2;
   Rough5RevolutionCurve; 6678; ;  HIDDEN; CAPTION; 레볼루션 프로파일; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 6678;;
		:
	END_STRING
   Rough5AxisEndPointX; 6661; 0;  HIDDEN; CAPTION; 축 끝 점 y | 축 끝 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   BEGIN_SUB_TECHNOLOGY; 3210; 516; CAPTION; 5축 어프로치; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 10;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   StartPointY; 3394; 0;  HIDDEN; CAPTION; 시작 지점 Y|시작 지점 X, Y; SOURCE; 0; TECHCODETYPE; 2;
   SetLimits; 3391; 0;  CAPTION; 리미트 설정; SOURCE; 0; TECHCODETYPE; 67;
   EntryMovesAngle; 3388; 0;  CAPTION; 스윙 각도; SOURCE; 0; TECHCODETYPE; 2;
   ArcAngle; 3303; 30;  HIDDEN; CAPTION; 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   ExtensionDistance; 6836; 0;  HIDDEN; CAPTION; 확장; SOURCE; 0; TECHCODETYPE; 2;
   MaximumX; 3385; 100;  HIDDEN; CAPTION; 최대 X|X 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   EntryMovesType; 3300; 7;  CAPTION; 접근 타입; SOURCE; 6; TECHCODETYPE; 431;
   RampHeight; 3382; 2;  HIDDEN; CAPTION; 램프 높이; SOURCE; 0; TECHCODETYPE; 2;
   StartPointX; 3393; 0;  HIDDEN; CAPTION; 시작 지점 X|시작 지점 X, Y; SOURCE; 0; TECHCODETYPE; 2;
   HelixDiameter; 3390; 10;  HIDDEN; CAPTION; 헬릭스 직경; SOURCE; 0; TECHCODETYPE; 2;
   TiltingAngle; 6600; 0;  HIDDEN; CAPTION; 기울기 각도; SOURCE; 0; TECHCODETYPE; 2;
   MaximumY; 3387; 100;  HIDDEN; CAPTION; 최대 Y|Y 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   ArcRadius; 3302; 4;  CAPTION; 원호 반경; SOURCE; 2; TECHCODETYPE; 2;
   TangentRampAngle; 6835; 0;  CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   MinimumX; 3384; 0;  HIDDEN; CAPTION; 최소 X|X 최소, 최대; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 20;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   TangentDistance; 3446; 0;  HIDDEN; CAPTION; 접선 거리; SOURCE; 0; TECHCODETYPE; 2;
   PredefinedPoints; 3395; ;  HIDDEN; CAPTION; 미리 정의된 점; SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 3395;;
		:
	END_STRING
   FromPredefinedPoints; 3392; 0;  HIDDEN; CAPTION; 미리 정의된 점으로부터; SOURCE; 0; TECHCODETYPE; 67;
   HelixAngle; 3389; 10;  HIDDEN; CAPTION; 헬릭스 각도; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  CAPTION; 가로 방향 거리; SOURCE; 2; TECHCODETYPE; 2;
   MinimumY; 3386; 0;  HIDDEN; CAPTION; 최소 Y|Y 최소, 최대; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3301; 1;  CAPTION; 수직 거리; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     3300; 7
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   BEGIN_SUB_TECHNOLOGY; 3210; 516; CAPTION; 5축 어프로치; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 10;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   StartPointY; 3394; 0;  HIDDEN; CAPTION; 시작 지점 Y|시작 지점 X, Y; SOURCE; 0; TECHCODETYPE; 2;
   SetLimits; 3391; 0;  HIDDEN; CAPTION; 리미트 설정; SOURCE; 0; TECHCODETYPE; 67;
   EntryMovesAngle; 3388; 0;  HIDDEN; CAPTION; 스윙 각도; SOURCE; 0; TECHCODETYPE; 2;
   ArcAngle; 3303; 30;  HIDDEN; CAPTION; 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   ExtensionDistance; 6836; 0;  HIDDEN; CAPTION; 확장; SOURCE; 0; TECHCODETYPE; 2;
   MaximumX; 3385; 100;  HIDDEN; CAPTION; 최대 X|X 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   EntryMovesType; 3300; 1;  CAPTION; 접근 타입; SOURCE; 0; TECHCODETYPE; 431;
   RampHeight; 3382; 2;  HIDDEN; CAPTION; 램프 높이; SOURCE; 0; TECHCODETYPE; 2;
   StartPointX; 3393; 0;  HIDDEN; CAPTION; 시작 지점 X|시작 지점 X, Y; SOURCE; 0; TECHCODETYPE; 2;
   HelixDiameter; 3390; 10;  HIDDEN; CAPTION; 헬릭스 직경; SOURCE; 0; TECHCODETYPE; 2;
   TiltingAngle; 6600; 0;  HIDDEN; CAPTION; 기울기 각도; SOURCE; 0; TECHCODETYPE; 2;
   MaximumY; 3387; 100;  HIDDEN; CAPTION; 최대 Y|Y 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   ArcRadius; 3302; 5;  HIDDEN; CAPTION; 원호 반경; SOURCE; 0; TECHCODETYPE; 2;
   TangentRampAngle; 6835; 0;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   MinimumX; 3384; 0;  HIDDEN; CAPTION; 최소 X|X 최소, 최대; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 20;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   TangentDistance; 3446; 0;  HIDDEN; CAPTION; 접선 거리; SOURCE; 0; TECHCODETYPE; 2;
   PredefinedPoints; 3395; ;  HIDDEN; CAPTION; 미리 정의된 점; SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 3395;;
		:
	END_STRING
   FromPredefinedPoints; 3392; 0;  HIDDEN; CAPTION; 미리 정의된 점으로부터; SOURCE; 0; TECHCODETYPE; 67;
   HelixAngle; 3389; 10;  HIDDEN; CAPTION; 헬릭스 각도; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; 가로 방향 거리; SOURCE; 0; TECHCODETYPE; 2;
   MinimumY; 3386; 0;  HIDDEN; CAPTION; 최소 Y|Y 최소, 최대; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3301; 2;  CAPTION; 수직 거리; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   RoundAllCorners; 3329; 1;  CAPTION; 모든 코너에 라운드; SOURCE; 1; TECHCODETYPE; 451;
   MaximumIncrementalDepth; 3380; 1;  HIDDEN; CAPTION; 최대 증분 깊이; SOURCE; 1; TECHCODETYPE; 2;
   4907; 4907; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4907;;
		:
	END_STRING
   4431; 4431; 2;  SOURCE; 0; TECHCODETYPE; 2;
   SpindleID; 793; 1;  CAPTION; 스핀들 이름; SOURCE; 1; TECHCODETYPE; 1;
   Rough5AxisStartPointX; 6658; 0;  HIDDEN; CAPTION; 축 시작 점 y | 축 시작 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   MaximumFeedratePT; 419; 0;  CAPTION; 최대 피드값 PT|최대 피드값 PM, PT; SOURCE; 3; TECHCODETYPE; 2;
   OutputZValue; 1218; 0;  CAPTION; Z값 출력; SOURCE; 1; TECHCODETYPE; 118;
   CustomSetting10; 640; 0;  CAPTION; 사용자 정의 설정 10; SOURCE; 1; TECHCODETYPE; 2;
   UseFeedSpeedKB; 1762; 0;  CAPTION; 피드/회전수KB사용; SOURCE; 1; TECHCODETYPE; 67;
   PositionOnBoundaryProfile; 3275; 4;  CAPTION; 경계선 프로파일에 위치; SOURCE; 2; TECHCODETYPE; 453;
   TrochoidalStrategy; 3326; 0;  CAPTION; 트로코이드 단계설정; SOURCE; 1; TECHCODETYPE; 67;
   DepthCalculation; 1422; 1;  CAPTION; 깊이 계산; SOURCE; 1; TECHCODETYPE; 449;
   4411; 4411; 554606;  SOURCE; 0; TECHCODETYPE; 2;
   OriginalKey; 4003; 6;  SOURCE; 0; TECHCODETYPE; 1;
   4904; 4904; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4904;;
		:
	END_STRING
   BottomZLimitRemapped; 6876; 0;  HIDDEN; CAPTION; 바닥 Z 리미트; SOURCE; 1; TECHCODETYPE; 2;
   MaxTrochoidWidthRatio; 7216; 400;  CAPTION; 최대. 트로코이달 폭 % | 최대. 트로코이달 폭,%; SOURCE; 1; TECHCODETYPE; 2;
   OptimizationMode; 3323; 1;  HIDDEN; CAPTION; 최적화 켜기; SOURCE; 3; TECHCODETYPE; 496;
   CustomSetting7; 637; 0;  CAPTION; 사용자 정의 설정 7; SOURCE; 1; TECHCODETYPE; 2;
   FeedratePT; 416; 0.10000000000000001;  CAPTION; 피드값 PT|피드값 PM, PT; SOURCE; 3; TECHCODETYPE; 2;
   4425; 4425; 12;  SOURCE; 0; TECHCODETYPE; 2;
   4901; 4901; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4901;;
		:3DRoughMilling_0Degree
	END_STRING
   RoughReverseSurfaceNormal; 6686; 0;  CAPTION; 면방향 반전; SOURCE; 1; TECHCODETYPE; 567;
   ProfitMillingSpindleSpeedRPM; 6720; 0;  CAPTION; 절삭 속도 RPM|절삭 속도RPM, SPM; SOURCE; 1; TECHCODETYPE; 1;
   AlternateCutDirection; 1705; 0;  CAPTION; 대안적인 절삭 사용; SOURCE; 1; TECHCODETYPE; 67;
   SmoothingDistance; 3405; 0;  HIDDEN; CAPTION; 스무딩 거리; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting4; 634; 0;  CAPTION; 사용자 정의 설정 4; SOURCE; 1; TECHCODETYPE; 2;
   LateralFeedRatePercent; 3201; 100;  CAPTION; 측면방향 피드값%; SOURCE; 1; TECHCODETYPE; 2;
   ToolID; 498; ;  CAPTION; 공구 ID; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 498;;
		:BM_D4
	END_STRING
   IncrementalDepth; 175; 0.5;  CAPTION; 증분 깊이; SOURCE; 2; TECHCODETYPE; 2;
   4422; 4422; 5;  SOURCE; 0; TECHCODETYPE; 2;
   Rough5SeamPointZ; 6666; 0;  HIDDEN; CAPTION; 실린더 심 포인트 Z | 실린더 심 포인트 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   MinimumCornerRadius; 6615; 1.6000000000000001;  CAPTION; 최소 모서리 반경; SOURCE; 1; TECHCODETYPE; 2;
   TrimCollisionReorganize; 6632; 0;  HIDDEN; CAPTION; 트림 공구 경로 재구성; SOURCE; 1; TECHCODETYPE; 521;
   HolderClearance; 3470; 0;  HIDDEN; CAPTION; 홀더 공차; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting1; 631; 0;  CAPTION; 사용자 정의 설정 1; SOURCE; 1; TECHCODETYPE; 2;
   Clearance; 172; 2;  CAPTION; 여유; SOURCE; 1; TECHCODETYPE; 2;
   PositionOnModelLimit; 1022; 4;  CAPTION; 모델리미트에 위치; SOURCE; 2; TECHCODETYPE; 452;
   StepPercentOfDiameter; 444; 25;  CAPTION; 스텝 직경의 % 값|스텝 오버, 직경의 %값; SOURCE; 3; TECHCODETYPE; 1;
   BottomZLimit; 1294; -2.2000000000000002;  CAPTION; 바닥 Z 리미트; SOURCE; 2; TECHCODETYPE; 2;
   4436; 4436; 9;  SOURCE; 0; TECHCODETYPE; 1;
   Rough5DriveEntityType; 6680; 1;  HIDDEN; CAPTION; 드라이브 엔티티 유형; SOURCE; 1; TECHCODETYPE; 531;
   Rough5AxisEndPointZ; 6663; 0;  HIDDEN; CAPTION; 실린더 이음 점 X|실린더 이음 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   BEGIN_SUB_TECHNOLOGY; 6833; 714; CAPTION; 5 Axis Exit Moves; SOURCE; 2; TECHCODETYPE; 410;
   ExitMovesType; 6834; 1;  CAPTION; 5 축 나가기 이동; SOURCE; 0; TECHCODETYPE; 563;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 10;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   EndPointY; 3394; 0;  HIDDEN; CAPTION; 엔드 포인트 Y|엔드포인트 X,Y; SOURCE; 0; TECHCODETYPE; 2;
   SetLimits; 3391; 0;  HIDDEN; CAPTION; 리미트 설정; SOURCE; 0; TECHCODETYPE; 67;
   EntryMovesAngle; 3388; 0;  HIDDEN; CAPTION; 스윙 각도; SOURCE; 0; TECHCODETYPE; 2;
   ArcAngle; 3303; 30;  HIDDEN; CAPTION; 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   ExtensionDistance; 6836; 0;  HIDDEN; CAPTION; 확장; SOURCE; 0; TECHCODETYPE; 2;
   MaximumX; 3385; 100;  HIDDEN; CAPTION; 최대 X|X 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   RampHeight; 3382; 2;  HIDDEN; CAPTION; 램프 높이; SOURCE; 0; TECHCODETYPE; 2;
   EndPointX; 3393; 0;  HIDDEN; CAPTION; 엔드 포인트 X|엔드포인트 X,Y; SOURCE; 0; TECHCODETYPE; 2;
   HelixDiameter; 3390; 10;  HIDDEN; CAPTION; 헬릭스 직경; SOURCE; 0; TECHCODETYPE; 2;
   TiltingAngle; 6600; 0;  HIDDEN; CAPTION; 기울기 각도; SOURCE; 0; TECHCODETYPE; 2;
   MaximumY; 3387; 100;  HIDDEN; CAPTION; 최대 Y|Y 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   ArcRadius; 3302; 5;  HIDDEN; CAPTION; 원호 반경; SOURCE; 0; TECHCODETYPE; 2;
   TangentRampAngle; 6835; 0;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   MinimumX; 3384; 0;  HIDDEN; CAPTION; 최소 X|X 최소, 최대; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 20;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   TangentDistance; 3446; 0;  HIDDEN; CAPTION; 접선 거리; SOURCE; 0; TECHCODETYPE; 2;
   PredefinedPoints; 3395; ;  HIDDEN; CAPTION; 미리 정의된 점; SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 3395;;
		:
	END_STRING
   FromPredefinedPoints; 3392; 0;  HIDDEN; CAPTION; 미리 정의된 점으로부터; SOURCE; 0; TECHCODETYPE; 67;
   HelixAngle; 3389; 10;  HIDDEN; CAPTION; 헬릭스 각도; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; 가로 방향 거리; SOURCE; 0; TECHCODETYPE; 2;
   MinimumY; 3386; 0;  HIDDEN; CAPTION; 최소 Y|Y 최소, 최대; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3301; 2;  CAPTION; 수직 거리; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   TrochoidTransitionFeedPercent; 492; 200;  CAPTION; 트랜지션 피드값%; SOURCE; 1; TECHCODETYPE; 1;
   EnableZLimits; 6646; 1;  CAPTION; 허용 Z리미트; SOURCE; 2; TECHCODETYPE; 67;
   EnableSmoothing; 3365; 0;  HIDDEN; CAPTION; 스무딩 사용; SOURCE; 1; TECHCODETYPE; 522;
   CornerRoundingTolerance; 3331; 0.5;  CAPTION; 코너 라운딩 공차; SOURCE; 1; TECHCODETYPE; 2;
   4909; 4909; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4909;;
		:
	END_STRING
   Rough5AxisStartPointZ; 6660; 0;  HIDDEN; CAPTION; 축 끝 점 X| 축 끝 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   ContactCornerRadius; 3328; 0.5;  HIDDEN; CAPTION; 코너 반경에 접촉; SOURCE; 1; TECHCODETYPE; 2;
   StepOver; 217; 1;  CAPTION; 스텝 오버|스텝 오버, 직경의 %값; SOURCE; 2; TECHCODETYPE; 2;
   4413; 4413; 4;  SOURCE; 0; TECHCODETYPE; 2;
   4906; 4906; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4906;;
		:user
	END_STRING
   4430; 4430; 2;  SOURCE; 0; TECHCODETYPE; 2;
   TurretID; 792; 1;  CAPTION; 터렛 이름; SOURCE; 1; TECHCODETYPE; 1;
   ZLevelEnableRTCP; 6844; 1;  CAPTION; RTCP 사용하기; SOURCE; 1; TECHCODETYPE; 67;
   HSO_CuttingStrategy; 6657; 0;  CAPTION; 절삭 단계 설정; SOURCE; 1; TECHCODETYPE; 185;
   AutoTilt; 3410; 0;  CAPTION; 오토틸트; SOURCE; 1; TECHCODETYPE; 67;
   CustomSetting9; 639; 0;  CAPTION; 사용자 정의 설정 9; SOURCE; 1; TECHCODETYPE; 2;
   SpindleSpeedSPM; 418; 75;  CAPTION; 절삭 속도 SPM|절삭 속도 RPM, SPM; SOURCE; 3; TECHCODETYPE; 1;
   BoundaryProfiles; 3274; ;  CAPTION; 경계선 프로파일; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 3274;;
		:6,3
	END_STRING
   MachiningPriority; 1387; 0;  CAPTION; 가공 우선 순위; SOURCE; 1; TECHCODETYPE; 221;
   PassPositionZ; 3325; 0;  HIDDEN; CAPTION; 경로 위치 Z; SOURCE; 1; TECHCODETYPE; 2;
   4410; 4410; 3293;  SOURCE; 0; TECHCODETYPE; 2;
   4903; 4903; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4903;;
		:
	END_STRING
   TopZLimitRemapped; 6875; 0;  HIDDEN; CAPTION; 상단 Z 리미트; SOURCE; 1; TECHCODETYPE; 2;
   MaxTrochoidWidth; 7215; 16;  CAPTION; 최대. 트로코이달 폭 | 최대. 트로코이달 폭,%; SOURCE; 3; TECHCODETYPE; 2;
   ProfitMillingIncrementalDepth; 6722; 0.40000000000000002;  CAPTION; 증분 깊이; SOURCE; 1; TECHCODETYPE; 2;
   MaxDistanceBetweenPoints; 3322; 0.10000000000000001;  HIDDEN; CAPTION; 포인트 사이의 최대 거리; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting6; 636; 0;  CAPTION; 사용자 정의 설정 6; SOURCE; 1; TECHCODETYPE; 2;
   RetractOptimization; 3203; 2;  CAPTION; 복귀 최적화; SOURCE; 1; TECHCODETYPE; 456;
   TypeOfCut; 432; ;  HIDDEN; CAPTION; 가공 종류; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 432;;
		:
	END_STRING
   SpindleSpeedRPM; 194; 6000;  CAPTION; 절삭 속도 RPM|절삭 속도RPM, SPM; SOURCE; 2; TECHCODETYPE; 1;
   Comment; 7; ;  CAPTION; 주석; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 7;;
		:
	END_STRING
   ModelLimitOffset; 3271; 0;  HIDDEN; CAPTION; 모델 리미트 오프셋; SOURCE; 1; TECHCODETYPE; 2;
   4424; 4424; 38;  SOURCE; 0; TECHCODETYPE; 2;
   DirectLinkMaxDistance; 6617; 100;  CAPTION; 직접 연결 최대.거리; SOURCE; 1; TECHCODETYPE; 2;
   FloorSurface; 6685; ;  CAPTION; 바닥면; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 6685;;
		:
	END_STRING
   ProfitMillingXYFeedratePT; 6719; 0;  CAPTION; XY피드값 PT|XY 피드값 PM, PT; SOURCE; 1; TECHCODETYPE; 2;
   EnableRTCP; 3200; 0;  CAPTION; RTCP 사용하기; SOURCE; 3; TECHCODETYPE; 67;
   CustomSetting3; 633; 0;  CAPTION; 사용자 정의 설정 3; SOURCE; 1; TECHCODETYPE; 2;
   FeedratePM; 191; 1200;  CAPTION; 피드값 PM|피드값 PM, PT; SOURCE; 2; TECHCODETYPE; 2;
   4421; 4421; 1;  SOURCE; 0; TECHCODETYPE; 2;
   4438; 4438; 0;  SOURCE; 0; TECHCODETYPE; 2;
   Rough5SeamPointY; 6665; 0;  HIDDEN; CAPTION; 실린더 이음 점Z|실린더 이음 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   MaxAngleBetweenPoints; 6512; 1;  HIDDEN; CAPTION; 점 사이의 최대 각도; SOURCE; 1; TECHCODETYPE; 2;
   EngagementAngle; 1769; 60.000000000000007;  CAPTION; 접촉 각도; SOURCE; 3; TECHCODETYPE; 2;
   TrimCollisionEnableJump; 6631; 0;  HIDDEN; CAPTION; 충돌 점프; SOURCE; 1; TECHCODETYPE; 67;
   FullClearance; 443; 10;  CAPTION; 전체 여유; SOURCE; 2; TECHCODETYPE; 2;
   OperationName; 613; ;  CAPTION; 작업 이름; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 613;;
		:Rough Mill 3D
	END_STRING
   CuttingStrategy; 1361; 2;  CAPTION; 절삭 단계 설정; SOURCE; 1; TECHCODETYPE; 450;
   TopZLimit; 1293; 100;  CAPTION; 상단 Z 리미트; SOURCE; 1; TECHCODETYPE; 2;
   ScallopHeight; 392; 0.10000000000000001;  HIDDEN; CAPTION; 스캘럽 높이; SOURCE; 1; TECHCODETYPE; 2;
   4435; 4435; 178.48445365165622;  SOURCE; 0; TECHCODETYPE; 2;
   HeadID; 797; 1;  CAPTION; 헤드 ID; SOURCE; 1; TECHCODETYPE; 1;
   Rough5InvertNormal; 6679; 0;  HIDDEN; CAPTION; Invert Revolution Surface Normal; SOURCE; 1; TECHCODETYPE; 530;
   Rough5AxisEndPointY; 6662; 0;  HIDDEN; CAPTION; 축 끝 점 Z| 축 끝 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   MinimumMaterialThickness; 3466; 0;  CAPTION; 최소 소재 두께; SOURCE; 1; TECHCODETYPE; 2;
   CornerRadius; 3330; 0;  HIDDEN; CAPTION; 코너 반경; SOURCE; 1; TECHCODETYPE; 2;
   4908; 4908; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4908;;
		:
	END_STRING
   MaxVertPlunge; 6676; 5.6999999999999993;  HIDDEN; CAPTION; 최대 버트. 플런지; SOURCE; 1; TECHCODETYPE; 2;
   Rough5AxisStartPointY; 6659; 0;  HIDDEN; CAPTION; 축 시작 점 Z| 축 시작 점 X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   ShankClearance; 3225; 0;  HIDDEN; CAPTION; 생크 공차; SOURCE; 3; TECHCODETYPE; 2;
   MaximumTiltAngle; 3412; 20;  HIDDEN; CAPTION; 최대 기울기 각도; SOURCE; 1; TECHCODETYPE; 2;
   StockAllowanceWalls; 233; 0.29999999999999999;  CAPTION; 벽면 가공 여유; SOURCE; 2; TECHCODETYPE; 2;
   RoundContactCorners; 3327; 0;  CAPTION; 접촉 코너에 라운드; SOURCE; 1; TECHCODETYPE; 67;
   4412; 4412; 1;  SOURCE; 0; TECHCODETYPE; 2;
   4905; 4905; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4905;;
		:
	END_STRING
   MinimumTrochoidRadiusMM; 6843; 1.6000000000000001;  CAPTION; 최소. 트로코이달반경 | 최소. 트로코이달반경, %; SOURCE; 3; TECHCODETYPE; 2;
   CustomSetting8; 638; 0;  CAPTION; 사용자 정의 설정 8; SOURCE; 1; TECHCODETYPE; 2;
   Tolerance; 1046; 0.01;  CAPTION; 공차; SOURCE; 2; TECHCODETYPE; 2;
   4902; 4902; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4902;;
		:
	END_STRING
   EnableZLimitsRemapped; 6874; 0;  HIDDEN; CAPTION; 허용 Z리미트; SOURCE; 1; TECHCODETYPE; 67;
   DepthStrategy; 6840; 1;  CAPTION; 깊이 단계; SOURCE; 1; TECHCODETYPE; 565;
   FeedUnit; 193; 1;  CAPTION; 피드 단위; SOURCE; 1; TECHCODETYPE; 25;
   ProfitMillingSpindleSpeedSPM; 6721; 0;  CAPTION; 절삭 속도 SPM|절삭 속도 RPM, SPM; SOURCE; 1; TECHCODETYPE; 1;
   LimitDistanceBetweenPoints; 3321; 0;  CAPTION; 지점 사이의 거리 리미트; SOURCE; 1; TECHCODETYPE; 67;
   CustomSetting5; 635; 0;  CAPTION; 사용자 정의 설정 5; SOURCE; 1; TECHCODETYPE; 2;
   PlungeFeedRatePercent; 3202; 400;  CAPTION; 플런지 피드값%; SOURCE; 2; TECHCODETYPE; 2;
   4423; 4423; 10;  SOURCE; 0; TECHCODETYPE; 2;
   MoldFollowCurvedFloor; 6837; 0;  CAPTION; 곡선 바닥을 따라; SOURCE; 1; TECHCODETYPE; 564;
   MaximumFeedratePM; 190; 0;  CAPTION; 최대 피드값 PM|최대 피드값 PM, PT; SOURCE; 1; TECHCODETYPE; 2;
   ProfitMillingXYFeedratePM; 6718; 0;  CAPTION; XY 피드값 PM|XY 피드값 PM, PT; SOURCE; 1; TECHCODETYPE; 2;
   MinimumTrochoidRadius; 6616; 40;  CAPTION; 최소. 트로코이달반경 % | 최소. 트로코이달반경, %; SOURCE; 1; TECHCODETYPE; 1;
   EnableCheckCollisionsWithStock; 6633; 0;  HIDDEN; CAPTION; 스톡 재확인; SOURCE; 1; TECHCODETYPE; 67;
   CollisionTolerance; 3471; 0.10000000000000001;  HIDDEN; CAPTION; 충돌 공차; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting2; 632; 0;  CAPTION; 사용자 정의 설정 2; SOURCE; 1; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     3380; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*0.25
     6615; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*(TechObj("6616").value)/100
     172; im(0.1,2)
     3331; DefaultCornerRoundingTolerance(Techobj,Tool1)
     3328; DefaultContactCornerRadius(Techobj,Tool1)
     6722; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*0.1
     3322; im(.005,.1)
     1293; TopZLimitFromFreeformFeature(Feature,4,100)
     392; im(.005,.1)
     3330; DefaultCornerRoundingRadius(Techobj,Tool1)
     6676; 0.95*ToolCutterLenght(Tool1)
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
END_OPERATION;
