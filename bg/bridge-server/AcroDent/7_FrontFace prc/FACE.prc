BEGIN_PROCESS; 공정 이름; 4;
BEGIN_OPERATION; 552; EM2.0BALL; 0;
   4437; 4437; 0;  SOURCE; 0; TECHCODETYPE; 2;
   4420; 4420; 2026;  SOURCE; 0; TECHCODETYPE; 2;
   CollisionDetection; 6630; 0;  CAPTION; 충돌 감지; SOURCE; 2; TECHCODETYPE; 520;
   ReferenceDepthOfCut; 1768; 0.20000000000000001;  HIDDEN; CAPTION; 참조 가공 깊이; SOURCE; 1; TECHCODETYPE; 2;
   StockAllowanceFloors; 272; 0;  CAPTION; 바닥 가공 여유; SOURCE; 2; TECHCODETYPE; 2;
   StartPointX; 3332; 0;  CAPTION; 시작 지점 X|시작 지점 X, Y; SOURCE; 2; TECHCODETYPE; 2;
   4434; 4434; 0;  SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_SUB_TECHNOLOGY; 3210; 516; CAPTION; 5축 어프로치; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 10;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   StartPointY; 3394; 0;  HIDDEN; CAPTION; 시작 지점 Y|시작 지점 X, Y; SOURCE; 0; TECHCODETYPE; 2;
   SetLimits; 3391; 0;  HIDDEN; CAPTION; 리미트 설정; SOURCE; 0; TECHCODETYPE; 67;
   EntryMovesAngle; 3388; 0;  HIDDEN; CAPTION; 스윙 각도; SOURCE; 0; TECHCODETYPE; 2;
   ArcAngle; 3303; 30;  HIDDEN; CAPTION; 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   ExtensionDistance; 6836; 0;  HIDDEN; CAPTION; 확장; SOURCE; 0; TECHCODETYPE; 2;
   MaximumX; 3385; 100;  HIDDEN; CAPTION; 최대 X|X 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   EntryMovesType; 3300; 1;  CAPTION; 접근 타입; SOURCE; 6; TECHCODETYPE; 431;
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
   VerticalDistance; 3301; 0.57999999999999996;  CAPTION; 수직 거리; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     3300; 1
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   RoundAllCorners; 3329; 0;  CAPTION; 모든 코너에 라운드; SOURCE; 1; TECHCODETYPE; 67;
   VaryStepByScallop; 371; 0;  CAPTION; 스캘럽 높이 최적화; SOURCE; 1; TECHCODETYPE; 67;
   4431; 4431; 2;  SOURCE; 0; TECHCODETYPE; 2;
   4907; 4907; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4907;;
		:
	END_STRING
   SpindleID; 793; 1;  CAPTION; 스핀들 이름; SOURCE; 1; TECHCODETYPE; 1;
   OutputZValue; 1218; 0;  CAPTION; Z값 출력; SOURCE; 1; TECHCODETYPE; 118;
   CustomSetting10; 640; 0;  CAPTION; 사용자 정의 설정 10; SOURCE; 1; TECHCODETYPE; 2;
   UseFeedSpeedKB; 1762; 0;  CAPTION; 피드/회전수KB사용; SOURCE; 1; TECHCODETYPE; 67;
   PositionOnBoundaryProfile; 3275; 4;  CAPTION; 경계선 프로파일에 위치; SOURCE; 2; TECHCODETYPE; 453;
   4904; 4904; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4904;;
		:
	END_STRING
   4003; 4003; 8;  SOURCE; 0; TECHCODETYPE; 1;
   OptimizationMode; 3323; 0;  HIDDEN; CAPTION; 최적화 켜기; SOURCE; 1; TECHCODETYPE; 496;
   CustomSetting7; 637; 0;  CAPTION; 사용자 정의 설정 7; SOURCE; 1; TECHCODETYPE; 2;
   FeedratePT; 416; 0.05;  CAPTION; 피드값 PT|피드값 PM, PT; SOURCE; 3; TECHCODETYPE; 2;
   PositionOnCheckSurface; 3272; 0;  CAPTION; 체크 서페이스에 위치; SOURCE; 2; TECHCODETYPE; 457;
   WallAngleLimit; 3340; 60;  HIDDEN; CAPTION; 벽면 각도 리미트; SOURCE; 1; TECHCODETYPE; 2;
   4901; 4901; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4901;;
		:3DMilling_FrontFace
	END_STRING
   4425; 4425; 3;  SOURCE; 0; TECHCODETYPE; 2;
   SmoothingDistance; 3405; 0;  HIDDEN; CAPTION; 스무딩 거리; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting4; 634; 0;  CAPTION; 사용자 정의 설정 4; SOURCE; 1; TECHCODETYPE; 2;
   LateralFeedRatePercent; 3201; 100;  CAPTION; 측면방향 피드값%; SOURCE; 1; TECHCODETYPE; 2;
   ToolID; 498; ;  CAPTION; 공구 ID; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 498;;
		:BM_D2
	END_STRING
   IncrementalDepth; 175; 0.5;  HIDDEN; CAPTION; 증분 깊이; SOURCE; 1; TECHCODETYPE; 2;
   AlternateCutDirection; 1705; 1;  CAPTION; 대안적인 절삭 사용; SOURCE; 1; TECHCODETYPE; 67;
   MaximumSlopeAngle; 3337; 90;  CAPTION; 최대 슬로프 각도; SOURCE; 1; TECHCODETYPE; 2;
   4422; 4422; 6;  SOURCE; 0; TECHCODETYPE; 2;
   TrimCollisionReorganize; 6632; 0;  HIDDEN; CAPTION; 트림 공구 경로 재구성; SOURCE; 0; TECHCODETYPE; 521;
   HolderClearance; 3470; 0;  HIDDEN; CAPTION; 홀더 공차; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting1; 631; 0;  CAPTION; 사용자 정의 설정 1; SOURCE; 1; TECHCODETYPE; 2;
   Clearance; 172; 1;  CAPTION; 여유; SOURCE; 2; TECHCODETYPE; 2;
   PositionOnModelLimit; 1022; 2;  CAPTION; 모델리미트에 위치; SOURCE; 3; TECHCODETYPE; 452;
   BottomZLimit; 1294; -1.432664031982422;  CAPTION; 바닥 Z 리미트; SOURCE; 2; TECHCODETYPE; 2;
   StepPercentOfDiameter; 444; 2;  CAPTION; 스텝 직경의 % 값|스텝 오버, 직경의 %값; SOURCE; 3; TECHCODETYPE; 1;
   4436; 4436; 9;  SOURCE; 0; TECHCODETYPE; 1;
   BEGIN_SUB_TECHNOLOGY; 6833; 714; CAPTION; 5 축 나가기 이동; SOURCE; 2; TECHCODETYPE; 410;
   ExitMovesType; 6834; 4;  CAPTION; 5 축 나가기 이동; SOURCE; 6; TECHCODETYPE; 563;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 10;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   EndPointY; 3394; 0;  HIDDEN; CAPTION; 엔드 포인트 Y|엔드포인트 X,Y; SOURCE; 0; TECHCODETYPE; 2;
   SetLimits; 3391; 0;  HIDDEN; CAPTION; 리미트 설정; SOURCE; 0; TECHCODETYPE; 67;
   EntryMovesAngle; 3388; 0;  CAPTION; 스윙 각도; SOURCE; 0; TECHCODETYPE; 2;
   ArcAngle; 3303; 180;  CAPTION; 원호 각도; SOURCE; 2; TECHCODETYPE; 2;
   ExtensionDistance; 6836; 0;  CAPTION; 확장; SOURCE; 0; TECHCODETYPE; 2;
   MaximumX; 3385; 100;  HIDDEN; CAPTION; 최대 X|X 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   RampHeight; 3382; 2;  HIDDEN; CAPTION; 램프 높이; SOURCE; 0; TECHCODETYPE; 2;
   EndPointX; 3393; 0;  HIDDEN; CAPTION; 엔드 포인트 X|엔드포인트 X,Y; SOURCE; 0; TECHCODETYPE; 2;
   HelixDiameter; 3390; 10;  HIDDEN; CAPTION; 헬릭스 직경; SOURCE; 0; TECHCODETYPE; 2;
   TiltingAngle; 6600; 0;  CAPTION; 기울기 각도; SOURCE; 0; TECHCODETYPE; 2;
   MaximumY; 3387; 100;  HIDDEN; CAPTION; 최대 Y|Y 최대, 최대; SOURCE; 0; TECHCODETYPE; 2;
   ArcRadius; 3302; 0.625;  CAPTION; 원호 반경; SOURCE; 2; TECHCODETYPE; 2;
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
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; 가로 방향 거리; SOURCE; 0; TECHCODETYPE; 2;
   MinimumY; 3386; 0;  HIDDEN; CAPTION; 최소 Y|Y 최소, 최대; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3301; 3;  CAPTION; 수직 거리; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     6834; 4
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   BEGIN_SUB_TECHNOLOGY; 6833; 714; CAPTION; 5 축 나가기 이동; SOURCE; 2; TECHCODETYPE; 410;
   ExitMovesType; 6834; 1;  CAPTION; 5 축 나가기 이동; SOURCE; 6; TECHCODETYPE; 563;
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
   VerticalDistance; 3301; 3;  CAPTION; 수직 거리; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     6834; 1
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   EnableZLimits; 6646; 1;  CAPTION; 허용 Z리미트; SOURCE; 2; TECHCODETYPE; 67;
   EnableSmoothing; 3365; 0;  HIDDEN; CAPTION; 스무딩 사용; SOURCE; 1; TECHCODETYPE; 522;
   4909; 4909; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4909;;
		:
	END_STRING
   ApproachInsideBoundary; 3277; 1;  CAPTION; 내부 경계; SOURCE; 1; TECHCODETYPE; 67;
   StepOver; 217; 0.05;  CAPTION; 스텝 오버|스텝 오버, 직경의 %값; SOURCE; 2; TECHCODETYPE; 2;
   4430; 4430; 7;  SOURCE; 0; TECHCODETYPE; 2;
   4906; 4906; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4906;;
		:user
	END_STRING
   TurretID; 792; 1;  CAPTION; 터렛 이름; SOURCE; 1; TECHCODETYPE; 1;
   AutoTilt; 3410; 0;  CAPTION; 오토틸트; SOURCE; 3; TECHCODETYPE; 67;
   CustomSetting9; 639; 0;  CAPTION; 사용자 정의 설정 9; SOURCE; 1; TECHCODETYPE; 2;
   SpindleSpeedSPM; 418; 31;  CAPTION; 절삭 속도 SPM|절삭 속도 RPM, SPM; SOURCE; 3; TECHCODETYPE; 1;
   BoundaryProfiles; 3274; ;  CAPTION; 경계선 프로파일; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 3274;;
		:
	END_STRING
   MachiningDirection; 1285; 0;  CAPTION; 가공 방향; SOURCE; 1; TECHCODETYPE; 454;
   4903; 4903; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4903;;
		:
	END_STRING
   MaxDistanceBetweenPoints; 3322; 0.10000000000000001;  HIDDEN; CAPTION; 포인트 사이의 최대 거리; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting6; 636; 0;  CAPTION; 사용자 정의 설정 6; SOURCE; 1; TECHCODETYPE; 2;
   RetractOptimization; 3203; 0;  CAPTION; 복귀 최적화; SOURCE; 3; TECHCODETYPE; 456;
   TypeOfCut; 432; ;  HIDDEN; CAPTION; 가공 종류; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 432;;
		:
	END_STRING
   SpindleSpeedRPM; 194; 5000;  CAPTION; 절삭 속도 RPM|절삭 속도RPM, SPM; SOURCE; 2; TECHCODETYPE; 1;
   Comment; 7; ;  CAPTION; 주석; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 7;;
		:
	END_STRING
   ModelLimitOffset; 3271; 0;  HIDDEN; CAPTION; 모델 리미트 오프셋; SOURCE; 1; TECHCODETYPE; 2;
   CutConcaveRegion; 3339; 0;  HIDDEN; CAPTION; 오목한 영역 컷; SOURCE; 1; TECHCODETYPE; 67;
   4424; 4424; 21;  SOURCE; 0; TECHCODETYPE; 2;
   EnableRTCP; 3200; 0;  CAPTION; RTCP 사용하기; SOURCE; 3; TECHCODETYPE; 67;
   RapidOver; 1364; 0;  CAPTION; 위로 급속; SOURCE; 1; TECHCODETYPE; 67;
   CustomSetting3; 633; 0;  CAPTION; 사용자 정의 설정 3; SOURCE; 1; TECHCODETYPE; 2;
   FeedratePM; 191; 1000;  CAPTION; 피드값 PM|피드값 PM, PT; SOURCE; 2; TECHCODETYPE; 2;
   MinimumSlopeAngle; 3336; 0;  CAPTION; 최소 슬로프 각도; SOURCE; 1; TECHCODETYPE; 2;
   4438; 4438; 0;  SOURCE; 0; TECHCODETYPE; 2;
   4421; 4421; 1;  SOURCE; 0; TECHCODETYPE; 2;
   TrimCollisionEnableJump; 6631; 0;  HIDDEN; CAPTION; 충돌 점프; SOURCE; 0; TECHCODETYPE; 67;
   FullClearance; 443; 1;  CAPTION; 전체 여유; SOURCE; 2; TECHCODETYPE; 2;
   OperationName; 613; ;  CAPTION; 작업 이름; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 613;;
		:EM2.0BALL
	END_STRING
   BEGIN_SUB_TECHNOLOGY; 3214; 515; CAPTION; 5축 피드 링크; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   OutArcRadius; 3400; 1.25;  CAPTION; Out 원호 반경|원호 반경 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 5;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   StartArcAngle; 3315; 30;  HIDDEN; CAPTION; 시작 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   InRampLength; 3397; 0;  CAPTION; In 램프 거리|램프 거리 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   OutArcAngle; 3402; 0;  CAPTION; Out 원호 각도|원호 각도 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   InRampAngle; 3399; 0;  CAPTION; In램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcRadius; 3314; 5;  HIDDEN; CAPTION; 원호 반경 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampLength; 3396; 0;  CAPTION; Out 램프 길이|램프 길이 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MaximumLinkDistance; 3311; 10;  HIDDEN; CAPTION; 최대 링크 거리; SOURCE; 0; TECHCODETYPE; 2;
   MaxZDifference; 3407; 0;  CAPTION; 최대 Z 차이; SOURCE; 2; TECHCODETYPE; 2;
   MinimumLoopWidth; 3404; 1;  HIDDEN; CAPTION; 최소 루프 폭; SOURCE; 0; TECHCODETYPE; 2;
   InArcRadius; 3401; 1.25;  CAPTION; In 원호 반경|원호 반경 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   EndArcAngle; 3316; 30;  HIDDEN; CAPTION; 원호 각도 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampAngle; 3398; 0;  CAPTION; Out 램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 5;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   StartArcRadius; 3313; 5;  HIDDEN; CAPTION; 시작 원호 반경; SOURCE; 0; TECHCODETYPE; 2;
   FeedLinkType; 3310; 11;  CAPTION; 피드 링크 타입; SOURCE; 6; TECHCODETYPE; 433;
   MaxZDifferenceAcross; 3406; 2.5;  CAPTION; 최대 Z 교차 차이 ; SOURCE; 2; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; 가로 방향 거리; SOURCE; 0; TECHCODETYPE; 2;
   InArcAngle; 3403; 0;  CAPTION; In 원호 각도|원호 각도 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   VerticalDistance; 3318; 0;  CAPTION; 수직 거리; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     3310; 11
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   BEGIN_SUB_TECHNOLOGY; 3214; 515; CAPTION; 5축 피드 링크; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   OutArcRadius; 3400; 1.25;  CAPTION; Out 원호 반경|원호 반경 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 5;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   StartArcAngle; 3315; 30;  HIDDEN; CAPTION; 시작 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   InRampLength; 3397; 0;  CAPTION; In 램프 거리|램프 거리 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   OutArcAngle; 3402; 0;  CAPTION; Out 원호 각도|원호 각도 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   InRampAngle; 3399; 0;  CAPTION; In램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcRadius; 3314; 5;  HIDDEN; CAPTION; 원호 반경 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampLength; 3396; 0;  CAPTION; Out 램프 길이|램프 길이 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MaximumLinkDistance; 3311; 10;  HIDDEN; CAPTION; 최대 링크 거리; SOURCE; 0; TECHCODETYPE; 2;
   MaxZDifference; 3407; 0;  CAPTION; 최대 Z 차이; SOURCE; 2; TECHCODETYPE; 2;
   MinimumLoopWidth; 3404; 1;  HIDDEN; CAPTION; 최소 루프 폭; SOURCE; 0; TECHCODETYPE; 2;
   InArcRadius; 3401; 1.25;  CAPTION; In 원호 반경|원호 반경 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   EndArcAngle; 3316; 30;  HIDDEN; CAPTION; 원호 각도 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampAngle; 3398; 0;  CAPTION; Out 램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 5;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   StartArcRadius; 3313; 5;  HIDDEN; CAPTION; 시작 원호 반경; SOURCE; 0; TECHCODETYPE; 2;
   FeedLinkType; 3310; 11;  CAPTION; 피드 링크 타입; SOURCE; 6; TECHCODETYPE; 433;
   MaxZDifferenceAcross; 3406; 10;  CAPTION; 최대 Z 교차 차이 ; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; 가로 방향 거리; SOURCE; 0; TECHCODETYPE; 2;
   InArcAngle; 3403; 0;  CAPTION; In 원호 각도|원호 각도 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   VerticalDistance; 3318; 1.25;  CAPTION; 수직 거리; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     3310; 11
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   BEGIN_SUB_TECHNOLOGY; 3214; 515; CAPTION; 5축 피드 링크; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   OutArcRadius; 3400; 0.625;  CAPTION; Out 원호 반경|원호 반경 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 5;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   StartArcAngle; 3315; 30;  HIDDEN; CAPTION; 시작 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   InRampLength; 3397; 0;  CAPTION; In 램프 거리|램프 거리 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   OutArcAngle; 3402; 45;  CAPTION; Out 원호 각도|원호 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   InRampAngle; 3399; 0;  CAPTION; In램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcRadius; 3314; 5;  HIDDEN; CAPTION; 원호 반경 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampLength; 3396; 0;  CAPTION; Out 램프 길이|램프 길이 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MaximumLinkDistance; 3311; 10;  HIDDEN; CAPTION; 최대 링크 거리; SOURCE; 0; TECHCODETYPE; 2;
   MaxZDifference; 3407; 0;  CAPTION; 최대 Z 차이; SOURCE; 2; TECHCODETYPE; 2;
   MinimumLoopWidth; 3404; 1;  HIDDEN; CAPTION; 최소 루프 폭; SOURCE; 0; TECHCODETYPE; 2;
   InArcRadius; 3401; 0.625;  CAPTION; In 원호 반경|원호 반경 In, Out; SOURCE; 2; TECHCODETYPE; 2;
   EndArcAngle; 3316; 30;  HIDDEN; CAPTION; 원호 각도 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampAngle; 3398; 0;  CAPTION; Out 램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 5;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   StartArcRadius; 3313; 5;  HIDDEN; CAPTION; 시작 원호 반경; SOURCE; 0; TECHCODETYPE; 2;
   FeedLinkType; 3310; 11;  CAPTION; 피드 링크 타입; SOURCE; 6; TECHCODETYPE; 433;
   MaxZDifferenceAcross; 3406; 10;  CAPTION; 최대 Z 교차 차이 ; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; 가로 방향 거리; SOURCE; 0; TECHCODETYPE; 2;
   InArcAngle; 3403; 45;  CAPTION; In 원호 각도|원호 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3318; 0;  CAPTION; 수직 거리; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     3310; 11
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   BEGIN_SUB_TECHNOLOGY; 3214; 515; CAPTION; 5축 피드 링크; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; 참조 가공 깊이; SOURCE; 0; TECHCODETYPE; 2;
   OutArcRadius; 3400; 2;  CAPTION; Out 원호 반경|원호 반경 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 5;  HIDDEN; CAPTION; 최소 램프 폭; SOURCE; 0; TECHCODETYPE; 2;
   StartArcAngle; 3315; 30;  HIDDEN; CAPTION; 시작 원호 각도; SOURCE; 0; TECHCODETYPE; 2;
   InRampLength; 3397; 0;  CAPTION; In 램프 거리|램프 거리 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   OutArcAngle; 3402; 45;  CAPTION; Out 원호 각도|원호 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   InRampAngle; 3399; 0;  CAPTION; In램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcRadius; 3314; 5;  HIDDEN; CAPTION; 원호 반경 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampLength; 3396; 0;  CAPTION; Out 램프 길이|램프 길이 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MaximumLinkDistance; 3311; 10;  HIDDEN; CAPTION; 최대 링크 거리; SOURCE; 0; TECHCODETYPE; 2;
   MaxZDifference; 3407; 10;  HIDDEN; CAPTION; 최대 Z 차이; SOURCE; 0; TECHCODETYPE; 2;
   MinimumLoopWidth; 3404; 1;  CAPTION; 최소 루프 폭; SOURCE; 0; TECHCODETYPE; 2;
   InArcRadius; 3401; 2;  CAPTION; In 원호 반경|원호 반경 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcAngle; 3316; 30;  HIDDEN; CAPTION; 원호 각도 끝; SOURCE; 0; TECHCODETYPE; 2;
   OutRampAngle; 3398; 0;  CAPTION; Out 램프 각도|램프 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 5;  HIDDEN; CAPTION; 램프각도; SOURCE; 0; TECHCODETYPE; 2;
   StartArcRadius; 3313; 5;  HIDDEN; CAPTION; 시작 원호 반경; SOURCE; 0; TECHCODETYPE; 2;
   FeedLinkType; 3310; 10;  CAPTION; 피드 링크 타입; SOURCE; 6; TECHCODETYPE; 433;
   MaxZDifferenceAcross; 3406; 10;  HIDDEN; CAPTION; 최대 Z 교차 차이 ; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; 가로 방향 거리; SOURCE; 0; TECHCODETYPE; 2;
   InArcAngle; 3403; 45;  CAPTION; In 원호 각도|원호 각도 In, Out; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3318; 2;  HIDDEN; CAPTION; 수직 거리; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     3310; 10
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   MachiningStrategy; 1361; 1;  CAPTION; 머시닝 방식; SOURCE; 1; TECHCODETYPE; 455;
   TopZLimit; 1293; 1;  CAPTION; 상단 Z 리미트; SOURCE; 2; TECHCODETYPE; 2;
   StartPointY; 3333; 2.0300000000000002;  CAPTION; 시작 지점 Y|시작 지점 X, Y; SOURCE; 2; TECHCODETYPE; 2;
   ScallopHeight; 392; 0.10000000000000001;  HIDDEN; CAPTION; 스캘럽 높이; SOURCE; 1; TECHCODETYPE; 2;
   4435; 4435; 62.10542175958745;  SOURCE; 0; TECHCODETYPE; 2;
   HeadID; 797; 1;  CAPTION; 헤드 ID; SOURCE; 1; TECHCODETYPE; 1;
   CornerRadius; 3330; 0.5;  HIDDEN; CAPTION; 코너 반경; SOURCE; 1; TECHCODETYPE; 2;
   4908; 4908; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4908;;
		:
	END_STRING
   ShankClearance; 3225; 0;  HIDDEN; CAPTION; 생크 공차; SOURCE; 3; TECHCODETYPE; 2;
   MaximumTiltAngle; 3412; 20;  HIDDEN; CAPTION; 최대 기울기 각도; SOURCE; 1; TECHCODETYPE; 2;
   StockAllowanceWalls; 233; -0.02000000000000000;  CAPTION; 벽면 가공 여유; SOURCE; 2; TECHCODETYPE; 2;
   PassAngle; 216; 90;  CAPTION; 경로 각도; SOURCE; 2; TECHCODETYPE; 2;
   4905; 4905; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4905;;
		:
	END_STRING
   ToolCompensation; 1284; 0;  CAPTION; 공구 보정; SOURCE; 0; TECHCODETYPE; 67;
   TangentPassExtension; 3324; 0;  CAPTION; 탄젠트 패스 확장 안; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting8; 638; 0;  CAPTION; 사용자 정의 설정 8; SOURCE; 1; TECHCODETYPE; 2;
   Tolerance; 1046; 0.01;  CAPTION; 공차; SOURCE; 2; TECHCODETYPE; 2;
   CheckSurfaceOffset; 3273; 0.5;  HIDDEN; CAPTION; 체크 서페이스 오프셋; SOURCE; 1; TECHCODETYPE; 2;
   ReconnectionDistance; 3341; 0.5;  CAPTION; 재연결 거리; SOURCE; 1; TECHCODETYPE; 2;
   4902; 4902; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4902;;
		:
	END_STRING
   LimitDistanceBetweenPoints; 3321; 0;  CAPTION; 지점 사이의 거리 리미트; SOURCE; 1; TECHCODETYPE; 67;
   CustomSetting5; 635; 0;  CAPTION; 사용자 정의 설정 5; SOURCE; 1; TECHCODETYPE; 2;
   PlungeFeedRatePercent; 3202; 10;  CAPTION; 플런지 피드값%; SOURCE; 2; TECHCODETYPE; 2;
   IncrementDepthLimit; 1213; 0;  CAPTION; 황삭 설정; SOURCE; 1; TECHCODETYPE; 67;
   SlopeLimitOffset; 3338; 0.20000000000000001;  CAPTION; 슬로프 리미트 오프셋; SOURCE; 1; TECHCODETYPE; 2;
   4423; 4423; 16;  SOURCE; 0; TECHCODETYPE; 2;
   EnableCheckCollisionsWithStock; 6633; 0;  HIDDEN; CAPTION; 스톡 재확인; SOURCE; 0; TECHCODETYPE; 67;
   CollisionTolerance; 3471; 0.10000000000000001;  HIDDEN; CAPTION; 충돌 공차; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting2; 632; 0;  CAPTION; 사용자 정의 설정 2; SOURCE; 1; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     175; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*0.25
     3322; im(.005,.1)
     392; im(.005,.1)
     3330; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*0.25
     3273; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*0.25
     3341; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*0.25
     3338; im(.01,.2)
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
END_OPERATION;
