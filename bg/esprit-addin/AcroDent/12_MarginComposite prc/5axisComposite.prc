BEGIN_PROCESS; ���� �̸�; 4;
BEGIN_OPERATION; 507; 5Axis_Composite; 0;
   4420; 4420; 2024;  SOURCE; 0; TECHCODETYPE; 2;
   4437; 4437; 0;  SOURCE; 0; TECHCODETYPE; 2;
   CollisionDetection; 6630; 0;  CAPTION; �浹 ����; SOURCE; 2; TECHCODETYPE; 520;
   LimitAngleBetweenPoints; 6511; 0;  CAPTION; �������� ���� ����; SOURCE; 1; TECHCODETYPE; 67;
   ReferenceDepthOfCut; 1768; 0.20000000000000001;  HIDDEN; CAPTION; ���� ���� ����; SOURCE; 1; TECHCODETYPE; 2;
   RoughPass; 238; 0;  CAPTION; Ȳ�� ���; SOURCE; 1; TECHCODETYPE; 67;
   ThroughPointX; 3247; 0;  HIDDEN; CAPTION; ���� ����Ʈ X|���� ����Ʈ X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   StockAllowance; 272; 0;  CAPTION; ���� ����; SOURCE; 2; TECHCODETYPE; 2;
   ReverseStepOverDirection; 3230; 0;  CAPTION; ������ ���� ���� ����; SOURCE; 2; TECHCODETYPE; 67;
   ContourPassMovement; 3264; 0;  HIDDEN; CAPTION; �н� �̵�; SOURCE; 1; TECHCODETYPE; 436;
   4434; 4434; 0;  SOURCE; 0; TECHCODETYPE; 2;
   SemiFinishingTool; 711; ;  CAPTION; �����ǴϽ� ����; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 711;;
		:
	END_STRING
   PinchMilling; 3465; 0;  CAPTION; ��ġ �и�; SOURCE; 1; TECHCODETYPE; 67;
   RemoveFinalIncompletePasses; 3414; 1;  CAPTION; �ҿ��� ��� ����; SOURCE; 2; TECHCODETYPE; 67;
   SpineEndPointY; 3244; 0;  HIDDEN; CAPTION; �� ����Ʈ Y|�� ����Ʈ X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   BEGIN_SUB_TECHNOLOGY; 3210; 516; CAPTION; 5 Axis Entry Moves; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; ���� ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 10;  HIDDEN; CAPTION; �ּ� ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   StartPointY; 3394; 0;  HIDDEN; CAPTION; ���� ���� Y|���� ���� X, Y; SOURCE; 0; TECHCODETYPE; 2;
   SetLimits; 3391; 0;  HIDDEN; CAPTION; ����Ʈ ����; SOURCE; 0; TECHCODETYPE; 67;
   EntryMovesAngle; 3388; 0;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   ArcAngle; 3303; 30;  HIDDEN; CAPTION; ��ȣ ����; SOURCE; 0; TECHCODETYPE; 2;
   ExtensionDistance; 6836; 0;  HIDDEN; CAPTION; Ȯ��; SOURCE; 0; TECHCODETYPE; 2;
   MaximumX; 3385; 100;  HIDDEN; CAPTION; �ִ� X|X �ִ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   EntryMovesType; 3300; 1;  CAPTION; ���� Ÿ��; SOURCE; 0; TECHCODETYPE; 431;
   RampHeight; 3382; 2;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   StartPointX; 3393; 0;  HIDDEN; CAPTION; ���� ���� X|���� ���� X, Y; SOURCE; 0; TECHCODETYPE; 2;
   HelixDiameter; 3390; 10;  HIDDEN; CAPTION; �︯�� ����; SOURCE; 0; TECHCODETYPE; 2;
   TiltingAngle; 6600; 0;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   MaximumY; 3387; 100;  HIDDEN; CAPTION; �ִ� Y|Y �ִ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   ArcRadius; 3302; 5;  HIDDEN; CAPTION; ��ȣ �ݰ�; SOURCE; 0; TECHCODETYPE; 2;
   TangentRampAngle; 6835; 0;  HIDDEN; CAPTION; ��������; SOURCE; 0; TECHCODETYPE; 2;
   MinimumX; 3384; 0;  HIDDEN; CAPTION; �ּ� X|X �ּ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 20;  HIDDEN; CAPTION; ��������; SOURCE; 0; TECHCODETYPE; 2;
   TangentDistance; 3446; 0;  HIDDEN; CAPTION; ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   PredefinedPoints; 3395; ;  HIDDEN; CAPTION; �̸� ���ǵ� ��; SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 3395;;
		:
	END_STRING
   FromPredefinedPoints; 3392; 0;  HIDDEN; CAPTION; �̸� ���ǵ� �����κ���; SOURCE; 0; TECHCODETYPE; 67;
   HelixAngle; 3389; 10;  HIDDEN; CAPTION; �︯�� ����; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; ���� ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   MinimumY; 3386; 0;  HIDDEN; CAPTION; �ּ� Y|Y �ּ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3301; 2;  CAPTION; ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   EntryMovesPointX; 3261; 0;  HIDDEN; CAPTION; ���� ����Ʈ X |���� ����Ʈ X,Y,Z; SOURCE; 1; TECHCODETYPE; 2;
   4907; 4907; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4907;;
		:
	END_STRING
   4431; 4431; 2;  SOURCE; 0; TECHCODETYPE; 2;
   SpindleID; 793; 1;  CAPTION; ���ɵ� �̸�; SOURCE; 1; TECHCODETYPE; 1;
   OutputZValue; 1218; 0;  CAPTION; Z�� ���; SOURCE; 2; TECHCODETYPE; 118;
   FirstPassPercent; 3462; 13;  CAPTION; ù �н� �ۼ�Ʈ; SOURCE; 2; TECHCODETYPE; 2;
   ToolCenterPercent; 3445; 100;  HIDDEN; CAPTION; ���� �߽� ������ %��; SOURCE; 2; TECHCODETYPE; 2;
   CustomSetting10; 640; 0;  CAPTION; ����� ���� ���� 10; SOURCE; 1; TECHCODETYPE; 2;
   AutoTiltMode; 3411; 1;  HIDDEN; CAPTION; �ڵ�ƿƮ ���; SOURCE; 1; TECHCODETYPE; 484;
   UseFeedSpeedKB; 1762; 0;  CAPTION; �ǵ�/ȸ����KB���; SOURCE; 1; TECHCODETYPE; 67;
   SpineStartPoinY; 3241; 0;  HIDDEN; CAPTION; ���� ���� Y|���� ���� X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   FixedAngle; 3258; 90;  CAPTION; ���� ����; SOURCE; 2; TECHCODETYPE; 2;
   DriveSurface; 3224; ;  CAPTION; ����̺� ���; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 3224;;
		:19,8000001
	END_STRING
   4003; 4003; 92;  SOURCE; 0; TECHCODETYPE; 1;
   4904; 4904; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4904;;
		:
	END_STRING
   OptimizationMode; 3323; 0;  HIDDEN; CAPTION; ����ȭ �ѱ�; SOURCE; 3; TECHCODETYPE; 496;
   CustomSetting7; 637; 0;  CAPTION; ����� ���� ���� 7; SOURCE; 1; TECHCODETYPE; 2;
   LimitPassesToStock; 3408; 1;  HIDDEN; CAPTION; ������� ��� ����Ʈ; SOURCE; 1; TECHCODETYPE; 67;
   SpineProfile; 3238; ;  HIDDEN; CAPTION; ������ ��������; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 3238;;
		:
	END_STRING
   ReferenceAxis; 3255; 1;  CAPTION; ���� ��; SOURCE; 1; TECHCODETYPE; 417;
   FeedratePT; 416; 1.5;  CAPTION; �ǵ尪 PT|�ǵ尪 PM, PT; SOURCE; 3; TECHCODETYPE; 2;
   4425; 4425; 2;  SOURCE; 0; TECHCODETYPE; 2;
   4901; 4901; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4901;;
		:3DMilling_0Degree
	END_STRING
   EndTangentPassPercent; 6635; 100;  HIDDEN; CAPTION; �� ��� �ۼ�Ʈ; SOURCE; 1; TECHCODETYPE; 2;
   SmoothingDistance; 3405; 0;  HIDDEN; CAPTION; ������ �Ÿ�; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting4; 634; 0;  CAPTION; ����� ���� ���� 4; SOURCE; 1; TECHCODETYPE; 2;
   IncrementalDepth; 175; 0.375;  HIDDEN; CAPTION; ���� ����; SOURCE; 1; TECHCODETYPE; 2;
   ToolID; 498; ;  CAPTION; ���� ID; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 498;;
		:T07_BM_D1.2
	END_STRING
   PlaneStartPointY; 3235; 0;  HIDDEN; CAPTION; ���� ���� Y|���� ���� X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   LateralFeedRatePercent; 3201; 100;  CAPTION; ������� �ǵ尪%; SOURCE; 1; TECHCODETYPE; 2;
   ChangePassStartPosition; 3269; 0;  CAPTION; ���� ���� ��� ����; SOURCE; 1; TECHCODETYPE; 67;
   4422; 4422; 19;  SOURCE; 0; TECHCODETYPE; 2;
   TrimCollisionReorganize; 6632; 0;  HIDDEN; CAPTION; Ʈ�� ���� ��� �籸��; SOURCE; 1; TECHCODETYPE; 521;
   LimitDeviationOnToolAxisTrace; 6513; 0;  HIDDEN; CAPTION; ���� �� ������ ���� �Ѱ�; SOURCE; 3; TECHCODETYPE; 67;
   HolderClearance; 3470; 0;  CAPTION; Ȧ�� ����; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting1; 631; 0;  CAPTION; ����� ���� ���� 1; SOURCE; 1; TECHCODETYPE; 2;
   ThroughPointZ; 3249; 0;  HIDDEN; CAPTION; ���� ����Ʈ Z|���� ����Ʈ X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   ProjectionDistance; 3232; 10;  CAPTION; ���� �Ÿ�; SOURCE; 1; TECHCODETYPE; 2;
   InlineAngle; 1226; 0;  CAPTION; ��-���� ����; SOURCE; 2; TECHCODETYPE; 2;
   Clearance; 172; 1;  CAPTION; ����; SOURCE; 2; TECHCODETYPE; 2;
   4436; 4436; 9;  SOURCE; 0; TECHCODETYPE; 1;
   TrailingDistance; 713; 0;  CAPTION; Ʈ���ϸ��Ÿ�; SOURCE; 1; TECHCODETYPE; 2;
   ThreadAngle; 6884; 0;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_SUB_TECHNOLOGY; 6833; 714; CAPTION; 5 Axis Exit Moves; SOURCE; 2; TECHCODETYPE; 410;
   ExitMovesType; 6834; 1;  CAPTION; 5 �� ������ �̵�; SOURCE; 0; TECHCODETYPE; 563;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; ���� ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 10;  HIDDEN; CAPTION; �ּ� ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   EndPointY; 3394; 0;  HIDDEN; CAPTION; ���� ����Ʈ Y|��������Ʈ X,Y; SOURCE; 0; TECHCODETYPE; 2;
   SetLimits; 3391; 0;  HIDDEN; CAPTION; ����Ʈ ����; SOURCE; 0; TECHCODETYPE; 67;
   EntryMovesAngle; 3388; 0;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   ArcAngle; 3303; 30;  HIDDEN; CAPTION; ��ȣ ����; SOURCE; 0; TECHCODETYPE; 2;
   ExtensionDistance; 6836; 0;  HIDDEN; CAPTION; Ȯ��; SOURCE; 0; TECHCODETYPE; 2;
   MaximumX; 3385; 100;  HIDDEN; CAPTION; �ִ� X|X �ִ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   RampHeight; 3382; 2;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   EndPointX; 3393; 0;  HIDDEN; CAPTION; ���� ����Ʈ X|��������Ʈ X,Y; SOURCE; 0; TECHCODETYPE; 2;
   HelixDiameter; 3390; 10;  HIDDEN; CAPTION; �︯�� ����; SOURCE; 0; TECHCODETYPE; 2;
   TiltingAngle; 6600; 0;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   MaximumY; 3387; 100;  HIDDEN; CAPTION; �ִ� Y|Y �ִ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   ArcRadius; 3302; 5;  HIDDEN; CAPTION; ��ȣ �ݰ�; SOURCE; 0; TECHCODETYPE; 2;
   TangentRampAngle; 6835; 0;  HIDDEN; CAPTION; ��������; SOURCE; 0; TECHCODETYPE; 2;
   MinimumX; 3384; 0;  HIDDEN; CAPTION; �ּ� X|X �ּ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 20;  HIDDEN; CAPTION; ��������; SOURCE; 0; TECHCODETYPE; 2;
   TangentDistance; 3446; 0;  HIDDEN; CAPTION; ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   PredefinedPoints; 3395; ;  HIDDEN; CAPTION; �̸� ���ǵ� ��; SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 3395;;
		:
	END_STRING
   FromPredefinedPoints; 3392; 0;  HIDDEN; CAPTION; �̸� ���ǵ� �����κ���; SOURCE; 0; TECHCODETYPE; 67;
   HelixAngle; 3389; 10;  HIDDEN; CAPTION; �︯�� ����; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  HIDDEN; CAPTION; ���� ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   MinimumY; 3386; 0;  HIDDEN; CAPTION; �ּ� Y|Y �ּ�, �ִ�; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3301; 2;  CAPTION; ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   EnableSmoothing; 3365; 0;  HIDDEN; CAPTION; ������ ���; SOURCE; 1; TECHCODETYPE; 522;
   ReverseCuttingDirection; 3229; 0;  CAPTION; ������ ���� ����; SOURCE; 2; TECHCODETYPE; 67;
   OrientationStrategy; 3246; 1;  CAPTION; ��ġ Ȯ�� ���; SOURCE; 2; TECHCODETYPE; 414;
   EntryMovesPointZ; 3263; 0;  HIDDEN; CAPTION; ���� ����Ʈ Z |���� ����Ʈ X,Y,Z; SOURCE; 1; TECHCODETYPE; 2;
   4909; 4909; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4909;;
		:
	END_STRING
   MinimizeRotation; 3464; 0;  HIDDEN; CAPTION; ȸ�� �ּ�ȭ; SOURCE; 3; TECHCODETYPE; 67;
   CuttingStrategy; 1390; 0;  HIDDEN; CAPTION; ���� �ܰ� ����; SOURCE; 1; TECHCODETYPE; 185;
   TiltReferenceAxis; 3413; 1;  HIDDEN; CAPTION; ������; SOURCE; 1; TECHCODETYPE; 417;
   UseApproachPoint; 3260; 0;  HIDDEN; CAPTION; ���� ����Ʈ ���; SOURCE; 1; TECHCODETYPE; 67;
   StepIncrement; 217; 0.14999999999999999;  CAPTION; ���� ����; SOURCE; 2; TECHCODETYPE; 2;
   SpineEndPointX; 3243; 0;  HIDDEN; CAPTION; �� ����Ʈ X|�� ����Ʈ X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   LoopAroundCorners; 3209; 0;  HIDDEN; CAPTION; �ڳ� �ֺ����� ����; SOURCE; 1; TECHCODETYPE; 67;
   4906; 4906; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4906;;
		:jin
	END_STRING
   4430; 4430; 14;  SOURCE; 0; TECHCODETYPE; 2;
   TurretID; 792; 1;  CAPTION; �ͷ� �̸�; SOURCE; 1; TECHCODETYPE; 1;
   CustomSetting9; 639; 0;  CAPTION; ����� ���� ���� 9; SOURCE; 1; TECHCODETYPE; 2;
   AutoTilt; 3410; 0;  CAPTION; ����ƿƮ; SOURCE; 1; TECHCODETYPE; 67;
   ToolPositionOnCurve; 3223; 0;  CAPTION; ���� ��ġ; SOURCE; 2; TECHCODETYPE; 412;
   SpineStartPointX; 3240; 0;  HIDDEN; CAPTION; ���� ���� X|���� ���� X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   SpindleSpeedSPM; 418; 24;  CAPTION; ���� �ӵ� SPM|���� �ӵ� RPM, SPM; SOURCE; 3; TECHCODETYPE; 1;
   MaximumAngle; 3257; 90;  HIDDEN; CAPTION; �ִ� ����; SOURCE; 1; TECHCODETYPE; 2;
   CuttingType; 3291; 0;  HIDDEN; CAPTION; ���� ����; SOURCE; 1; TECHCODETYPE; 443;
   4903; 4903; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4903;;
		:
	END_STRING
   MaxDistanceBetweenPoints; 3322; 0.20000000000000001;  HIDDEN; CAPTION; ����Ʈ ������ �ִ� �Ÿ�; SOURCE; 2; TECHCODETYPE; 2;
   CustomSetting6; 636; 0;  CAPTION; ����� ���� ���� 6; SOURCE; 1; TECHCODETYPE; 2;
   TypeOfCut; 432; ;  HIDDEN; CAPTION; ���� ����; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 432;;
		:
	END_STRING
   SpindleSpeedRPM; 194; 5000;  CAPTION; ���� �ӵ� RPM|���� �ӵ�RPM, SPM; SOURCE; 2; TECHCODETYPE; 1;
   RetractOptimization; 3203; 0;  CAPTION; ���� ����ȭ; SOURCE; 2; TECHCODETYPE; 456;
   EndingDistance; 3237; 50;  HIDDEN; CAPTION; ������ �Ÿ�; SOURCE; 1; TECHCODETYPE; 2;
   Comment; 7; ;  CAPTION; �ּ�; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 7;;
		:
	END_STRING
   AngleLimitation; 3254; 2;  CAPTION; ���� �Ѱ�; SOURCE; 2; TECHCODETYPE; 416;
   4424; 4424; 0;  SOURCE; 0; TECHCODETYPE; 2;
   BeginTangentPassPercent; 6634; 0;  HIDDEN; CAPTION; ���� ��� �ۼ�Ʈ; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting3; 633; 0;  CAPTION; ����� ���� ���� 3; SOURCE; 1; TECHCODETYPE; 2;
   PassPosition; 718; 2;  CAPTION; �н� ��ġ; SOURCE; 2; TECHCODETYPE; 501;
   PlaneStartPointX; 3234; 0;  HIDDEN; CAPTION; ���� ���� X|���� ���� X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   FeedratePM; 191; 15000;  CAPTION; �ǵ尪 PM|�ǵ尪 PM, PT; SOURCE; 3; TECHCODETYPE; 2;
   EnableRTCP; 3200; 0;  CAPTION; RTCP ����ϱ�; SOURCE; 2; TECHCODETYPE; 67;
   4421; 4421; 12;  SOURCE; 0; TECHCODETYPE; 2;
   4438; 4438; 0;  SOURCE; 0; TECHCODETYPE; 2;
   SemiFinishingAllowance; 2517; 0;  CAPTION; �����ǴϽ� ����; SOURCE; 1; TECHCODETYPE; 2;
   ScallopHeight; 392; 0.001;  HIDDEN; CAPTION; ��Ķ�� ����; SOURCE; 2; TECHCODETYPE; 2;
   TrimCollisionEnableJump; 6631; 0;  HIDDEN; CAPTION; �浹 ����; SOURCE; 1; TECHCODETYPE; 67;
   MaxAngleBetweenPoints; 6512; 1;  HIDDEN; CAPTION; �� ������ �ִ� ����; SOURCE; 1; TECHCODETYPE; 2;
   ThroughPointY; 3248; 0;  HIDDEN; CAPTION; ���� ����Ʈ Y|���� ����Ʈ X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   ReverseProjectionSide; 3231; 0;  CAPTION; ������ ���� ��; SOURCE; 1; TECHCODETYPE; 67;
   PassMovement; 1361; 0;  CAPTION; �н� �̵�; SOURCE; 3; TECHCODETYPE; 415;
   OrientationProfile; 3265; ;  HIDDEN; CAPTION; ���������̼� ��������; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 3265;;
		:
	END_STRING
   OperationName; 613; ;  CAPTION; �۾� �̸�; SOURCE; 2; TECHCODETYPE; 3;
	BEGIN_STRING; 613;;
		:5Axis_Composite
	END_STRING
   FullClearance; 443; 10;  CAPTION; ��ü ����; SOURCE; 2; TECHCODETYPE; 2;
   BEGIN_SUB_TECHNOLOGY; 3214; 515; CAPTION; 5 Axis Feed Links; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; ���� ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   OutArcRadius; 3400; 2;  CAPTION; Out ��ȣ �ݰ�|��ȣ �ݰ� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 5;  CAPTION; �ּ� ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   StartArcAngle; 3315; 30;  CAPTION; ���� ��ȣ ����; SOURCE; 0; TECHCODETYPE; 2;
   InRampLength; 3397; 0;  CAPTION; In ���� �Ÿ�|���� �Ÿ� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   OutArcAngle; 3402; 45;  CAPTION; Out ��ȣ ����|��ȣ ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   InRampAngle; 3399; 0;  CAPTION; In���� ����|���� ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcRadius; 3314; 5;  CAPTION; ��ȣ �ݰ� ��; SOURCE; 0; TECHCODETYPE; 2;
   OutRampLength; 3396; 0;  CAPTION; Out ���� ����|���� ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MaximumLinkDistance; 3311; 10;  CAPTION; �ִ� ��ũ �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   MaxZDifference; 3407; 10;  CAPTION; �ִ� Z ����; SOURCE; 0; TECHCODETYPE; 2;
   MinimumLoopWidth; 3404; 1;  CAPTION; �ּ� ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   InArcRadius; 3401; 2;  CAPTION; In ��ȣ �ݰ�|��ȣ �ݰ� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcAngle; 3316; 30;  CAPTION; ��ȣ ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   OutRampAngle; 3398; 0;  CAPTION; Out ���� ����|���� ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 5;  CAPTION; ��������; SOURCE; 0; TECHCODETYPE; 2;
   StartArcRadius; 3313; 5;  CAPTION; ���� ��ȣ �ݰ�; SOURCE; 0; TECHCODETYPE; 2;
   FeedLinkType; 3310; 1;  CAPTION; �ǵ� ��ũ Ÿ��; SOURCE; 0; TECHCODETYPE; 433;
   MaxZDifferenceAcross; 3406; 10;  CAPTION; �ִ� Z ���� ���� ; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  CAPTION; ���� ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   InArcAngle; 3403; 45;  CAPTION; In ��ȣ ����|��ȣ ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3318; 2;  CAPTION; ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   BEGIN_SUB_TECHNOLOGY; 3214; 515; CAPTION; 5 Axis Feed Links; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; ���� ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   OutArcRadius; 3400; 2;  CAPTION; Out ��ȣ �ݰ�|��ȣ �ݰ� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MinimumRampWidth; 3383; 5;  CAPTION; �ּ� ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   StartArcAngle; 3315; 30;  CAPTION; ���� ��ȣ ����; SOURCE; 0; TECHCODETYPE; 2;
   InRampLength; 3397; 0;  CAPTION; In ���� �Ÿ�|���� �Ÿ� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   OutArcAngle; 3402; 45;  CAPTION; Out ��ȣ ����|��ȣ ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   InRampAngle; 3399; 0;  CAPTION; In���� ����|���� ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcRadius; 3314; 5;  CAPTION; ��ȣ �ݰ� ��; SOURCE; 0; TECHCODETYPE; 2;
   OutRampLength; 3396; 0;  CAPTION; Out ���� ����|���� ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   MaximumLinkDistance; 3311; 10;  CAPTION; �ִ� ��ũ �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   MaxZDifference; 3407; 10;  CAPTION; �ִ� Z ����; SOURCE; 0; TECHCODETYPE; 2;
   MinimumLoopWidth; 3404; 1;  CAPTION; �ּ� ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   InArcRadius; 3401; 2;  CAPTION; In ��ȣ �ݰ�|��ȣ �ݰ� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   EndArcAngle; 3316; 30;  CAPTION; ��ȣ ���� ��; SOURCE; 0; TECHCODETYPE; 2;
   OutRampAngle; 3398; 0;  CAPTION; Out ���� ����|���� ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   RampAngle; 3381; 5;  CAPTION; ��������; SOURCE; 0; TECHCODETYPE; 2;
   StartArcRadius; 3313; 5;  CAPTION; ���� ��ȣ �ݰ�; SOURCE; 0; TECHCODETYPE; 2;
   FeedLinkType; 3310; 2;  CAPTION; �ǵ� ��ũ Ÿ��; SOURCE; 0; TECHCODETYPE; 433;
   MaxZDifferenceAcross; 3406; 10;  CAPTION; �ִ� Z ���� ���� ; SOURCE; 0; TECHCODETYPE; 2;
   LateralDistance; 3304; 2;  CAPTION; ���� ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   InArcAngle; 3403; 45;  CAPTION; In ��ȣ ����|��ȣ ���� In, Out; SOURCE; 0; TECHCODETYPE; 2;
   VerticalDistance; 3318; 3;  CAPTION; ���� �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   4435; 4435; 270.33315365135826;  SOURCE; 0; TECHCODETYPE; 2;
   HeadID; 797; 1;  CAPTION; ��� ID; SOURCE; 1; TECHCODETYPE; 1;
   MultitheadSpiral; 6883; 0;  CAPTION; ���� ������ ������; SOURCE; 0; TECHCODETYPE; 597;
   IncrementCalculation; 6815; 1;  CAPTION; ���� ���; SOURCE; 2; TECHCODETYPE; 558;
   TowardProfile; 3449; 1;  HIDDEN; CAPTION; �������� ������; SOURCE; 2; TECHCODETYPE; 67;
   PreventToolCenterCut; 3415; 0;  CAPTION; ���� ���� ���� ����; SOURCE; 2; TECHCODETYPE; 67;
   SpineEndPointZ; 3245; 0;  HIDDEN; CAPTION; �� ����Ʈ Z|�� ����Ʈ X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   BEGIN_SUB_TECHNOLOGY; 3211; 514; CAPTION; 5 Axis Rapid; SOURCE; 2; TECHCODETYPE; 410;
   ReferenceDepthOfCut; 1768; 5;  CAPTION; ���� ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   RadialOffsetFactor; 3448; 1;  CAPTION; ���� ������ �μ�; SOURCE; 0; TECHCODETYPE; 2;
   IntermediateDirection; 3309; 1;  HIDDEN; CAPTION; �ﰢ���� ����; SOURCE; 0; TECHCODETYPE; 434;
   MaximumLinkDistance; 3306; 20;  HIDDEN; CAPTION; �ִ� ��ũ �Ÿ�; SOURCE; 0; TECHCODETYPE; 2;
   SideClearance; 3320; 10;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   MaximumAngle; 3308; 0;  HIDDEN; CAPTION; �ִ� ����; SOURCE; 0; TECHCODETYPE; 2;
   RapidLinkType; 3305; 12;  CAPTION; �޼� ��ũ; SOURCE; 0; TECHCODETYPE; 432;
   AboveClearance; 3319; 10;  HIDDEN; CAPTION; ���� ����; SOURCE; 0; TECHCODETYPE; 2;
   AxialLength; 3307; 5;  HIDDEN; CAPTION; �� ����; SOURCE; 0; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
   END_SUB_TECHNOLOGY;
   CuttingDirection; 3228; 1;  CAPTION; ���� ����; SOURCE; 2; TECHCODETYPE; 413;
   EntryMovesPointY; 3262; 0;  HIDDEN; CAPTION; ���� ����Ʈ Y |���� ����Ʈ X,Y,Z; SOURCE; 1; TECHCODETYPE; 2;
   4908; 4908; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4908;;
		:
	END_STRING
   LastPassPercent; 3463; 40;  CAPTION; ������ �н� �ۼ�Ʈ; SOURCE; 2; TECHCODETYPE; 2;
   ShankClearance; 3225; 0;  CAPTION; ��ũ ����; SOURCE; 1; TECHCODETYPE; 2;
   MaximumTiltAngle; 3412; 20;  HIDDEN; CAPTION; �ִ� ���� ����; SOURCE; 1; TECHCODETYPE; 2;
   SpineStartPointZ; 3242; 0;  HIDDEN; CAPTION; ���� ���� Z|���� ���� X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   4905; 4905; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4905;;
		:
	END_STRING
   ToolCompensation; 1284; 0;  HIDDEN; CAPTION; ���� ����; SOURCE; 1; TECHCODETYPE; 67;
   TangentPassExtension; 3324; 0;  HIDDEN; CAPTION; ź��Ʈ �н� Ȯ�� ��; SOURCE; 2; TECHCODETYPE; 2;
   CustomSetting8; 638; 0;  CAPTION; ����� ���� ���� 8; SOURCE; 1; TECHCODETYPE; 2;
   PassPositionPercent; 3409; 50;  HIDDEN; CAPTION; ��� ��ġ �ۼ�Ʈ; SOURCE; 1; TECHCODETYPE; 2;
   Tolerance; 1046; 0.02;  CAPTION; ����; SOURCE; 2; TECHCODETYPE; 2;
   PointSelectionOnProfile; 3290; 0;  HIDDEN; CAPTION; �������Ͽ��� �� ����; SOURCE; 3; TECHCODETYPE; 442;
   MinimumAngle; 3256; 0;  HIDDEN; CAPTION; �ּ� ����; SOURCE; 1; TECHCODETYPE; 2;
   MachiningPattern; 3222; 6;  CAPTION; ���� ����; SOURCE; 2; TECHCODETYPE; 411;
   4902; 4902; ;  SOURCE; 0; TECHCODETYPE; 3;
	BEGIN_STRING; 4902;;
		:
	END_STRING
   LimitDistanceBetweenPoints; 3321; 0;  CAPTION; ���� ������ �Ÿ� ����Ʈ; SOURCE; 2; TECHCODETYPE; 67;
   CustomSetting5; 635; 0;  CAPTION; ����� ���� ���� 5; SOURCE; 1; TECHCODETYPE; 2;
   PlungeFeedRatePercent; 3202; 10;  CAPTION; �÷��� �ǵ尪%; SOURCE; 2; TECHCODETYPE; 2;
   PlaneStartPointZ; 3236; 0;  HIDDEN; CAPTION; ���� ���� Z|���� ���� X, Y, Z; SOURCE; 1; TECHCODETYPE; 2;
   4423; 4423; 11;  SOURCE; 0; TECHCODETYPE; 2;
   CuttingDirectionAngleWrstU; 6650; 0;  HIDDEN; CAPTION; Angle wrst U; SOURCE; 1; TECHCODETYPE; 2;
   EnableCheckCollisionsWithStock; 6633; 0;  HIDDEN; CAPTION; ���� ��Ȯ��; SOURCE; 1; TECHCODETYPE; 67;
   MaxAngleOnToolTrace; 6514; 5;  HIDDEN; CAPTION; ���� �� ������ �ִ� ����; SOURCE; 1; TECHCODETYPE; 2;
   CustomSetting2; 632; 0;  CAPTION; ����� ���� ���� 2; SOURCE; 1; TECHCODETYPE; 2;
   StockOffset; 3369; 0;  HIDDEN; CAPTION; ���� �Ÿ�; SOURCE; 1; TECHCODETYPE; 2;
   ToolDirectionTowardThroughPoint; 3250; 1;  HIDDEN; CAPTION; ����Ʈ ������; SOURCE; 2; TECHCODETYPE; 67;
   PlaneName; 3233; ;  HIDDEN; CAPTION; �۾���; SOURCE; 1; TECHCODETYPE; 3;
	BEGIN_STRING; 3233;;
		:XYZ
	END_STRING
   CrossAngle; 1261; 0;  CAPTION; ���� ����; SOURCE; 1; TECHCODETYPE; 2;
   BEGIN_EXPRESSION
     175; CoverttoSysUnit(Tool1("ToolDiameter").value ,Tool1("ToolUnit").value )*0.25
     3232; im(1,10)
     3237; im(2,50)
   END_EXPRESSION
	BEGIN_ATTRIBUTES
	END_ATTRIBUTES
END_OPERATION;
