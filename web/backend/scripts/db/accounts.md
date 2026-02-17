# accounts

## Admin

- admin.owner@demo.abuts.fit / `Ao!6fN#9rV@4cH2$` (owner)
- admin.staff@demo.abuts.fit / `As!4mJ#7tK@9pW3$` (staff)

## Manufacturer

- manufacturer.owner@demo.abuts.fit / `Mo!7vL#6pR@3sB8$` (owner)
- manufacturer.staff@demo.abuts.fit / `Ms!5kP#8wQ@2nZ7$` (staff)

## Requestor (기본 데모)

- requestor.owner@demo.abuts.fit / `Rq!8zY#4fQ@7nC5$` (owner) — org: 데모기공소
- requestor.staff@demo.abuts.fit / `Rs!9xT#5gA@6mD4$` (staff) — org: 데모기공소, referredBy=owner

## Requestor 추가 10명 (demo-org-1~5, 비번 `Rq!1111111`)

- req1.owner@demo.abuts.fit / `Rq!1111111` / code `RQ1AA` — org demo-org-1
- req1.staff@demo.abuts.fit / `Rq!1111111` / code `RQ1BB` — org demo-org-1, referredBy=req1.owner
- req2.owner@demo.abuts.fit / `Rq!1111111` / code `RQ2AA` — org demo-org-2
- req2.staff@demo.abuts.fit / `Rq!1111111` / code `RQ2BB` — org demo-org-2, referredBy=req2.owner
- req3.owner@demo.abuts.fit / `Rq!1111111` / code `RQ3AA` — org demo-org-3
- req3.staff@demo.abuts.fit / `Rq!1111111` / code `RQ3BB` — org demo-org-3, referredBy=req3.owner
- req4.owner@demo.abuts.fit / `Rq!1111111` / code `RQ4AA` — org demo-org-4
- req4.staff@demo.abuts.fit / `Rq!1111111` / code `RQ4BB` — org demo-org-4, referredBy=req4.owner
- req5.owner@demo.abuts.fit / `Rq!1111111` / code `RQ5AA` — org demo-org-5
- req5.staff@demo.abuts.fit / `Rq!1111111` / code `RQ5BB` — org demo-org-5, referredBy=req5.owner

## Requestor 추가 20명 (demo-org-6~15, 비번 `Rq!1111111`)

- 짝수 org owner는 직전 org owner가 추천, 홀수 org owner는 sales1이 추천. staff는 각 대표가 추천.
- req6.owner@demo.abuts.fit / code `RQ6CC` — org demo-org-6, referredBy=req5.owner
- req6.staff@demo.abuts.fit / code `RQ6DD` — org demo-org-6, referredBy=req6.owner
- req7.owner@demo.abuts.fit / code `RQ7CC` — org demo-org-7, referredBy=sales1
- req7.staff@demo.abuts.fit / code `RQ7DD` — org demo-org-7, referredBy=req7.owner
- req8.owner@demo.abuts.fit / code `RQ8CC` — org demo-org-8, referredBy=req7.owner
- req8.staff@demo.abuts.fit / code `RQ8DD` — org demo-org-8, referredBy=req8.owner
- req9.owner@demo.abuts.fit / code `RQ9CC` — org demo-org-9, referredBy=sales1
- req9.staff@demo.abuts.fit / code `RQ9DD` — org demo-org-9, referredBy=req9.owner
- req10.owner@demo.abuts.fit / code `RQ10CC` — org demo-org-10, referredBy=req9.owner
- req10.staff@demo.abuts.fit / code `RQ10DD` — org demo-org-10, referredBy=req10.owner
- req11.owner@demo.abuts.fit / code `RQ11CC` — org demo-org-11, referredBy=sales1
- req11.staff@demo.abuts.fit / code `RQ11DD` — org demo-org-11, referredBy=req11.owner
- req12.owner@demo.abuts.fit / code `RQ12CC` — org demo-org-12, referredBy=req11.owner
- req12.staff@demo.abuts.fit / code `RQ12DD` — org demo-org-12, referredBy=req12.owner
- req13.owner@demo.abuts.fit / code `RQ13CC` — org demo-org-13, referredBy=sales1
- req13.staff@demo.abuts.fit / code `RQ13DD` — org demo-org-13, referredBy=req13.owner
- req14.owner@demo.abuts.fit / code `RQ14CC` — org demo-org-14, referredBy=req13.owner
- req14.staff@demo.abuts.fit / code `RQ14DD` — org demo-org-14, referredBy=req14.owner
- req15.owner@demo.abuts.fit / code `RQ15CC` — org demo-org-15, referredBy=sales1
- req15.staff@demo.abuts.fit / code `RQ15DD` — org demo-org-15, referredBy=req15.owner

## Salesman (비번 `Sa!1111111`)

- 체인: sales1@demo.abuts.fit / code `SA01` (root)
- sales2@demo.abuts.fit / `Sa!1111111` / code `SA02` (ref by sales1)
- sales3@demo.abuts.fit / `Sa!1111111` / code `SA03` (ref by sales2)
- sales4@demo.abuts.fit / `Sa!1111111` / code `SA04` (ref by sales3)
- sales5@demo.abuts.fit / `Sa!1111111` / code `SA05` (ref by sales4)
- sales6@demo.abuts.fit / `Sa!1111111` / code `SA06` (ref by sales5)
- sales7@demo.abuts.fit / `Sa!1111111` / code `SA07` (ref by sales6)
- sales8@demo.abuts.fit / `Sa!1111111` / code `SA08` (ref by sales7)
- sales9@demo.abuts.fit / `Sa!1111111` / code `SA09` (ref by sales8)
- sales10@demo.abuts.fit / `Sa!1111111` / code `SA10` (ref by sales9)

- 팬아웃(모두 sales1 추천):
  - sales11@demo.abuts.fit / `Sa!1111111` / code `SB11`
  - sales12@demo.abuts.fit / `Sa!1111111` / code `SB12`
  - sales13@demo.abuts.fit / `Sa!1111111` / code `SB13`
  - sales14@demo.abuts.fit / `Sa!1111111` / code `SB14`
  - sales15@demo.abuts.fit / `Sa!1111111` / code `SB15`

- 체인 (sales11 → 12 → … → 20):
  - sales16@demo.abuts.fit / `Sa!1111111` / code `SB16` (ref by sales11)
  - sales17@demo.abuts.fit / `Sa!1111111` / code `SB17`
  - sales18@demo.abuts.fit / `Sa!1111111` / code `SB18`
  - sales19@demo.abuts.fit / `Sa!1111111` / code `SB19`
  - sales20@demo.abuts.fit / `Sa!1111111` / code `SB20`

- 의뢰자 대표 교차 추천 (referrer = req6~req15 owner):
  - sales21@demo.abuts.fit / `Sa!1111111` / code `SB21` (ref by req6.owner)
  - sales22@demo.abuts.fit / `Sa!1111111` / code `SB22` (ref by req7.owner)
  - sales23@demo.abuts.fit / `Sa!1111111` / code `SB23` (ref by req8.owner)
  - sales24@demo.abuts.fit / `Sa!1111111` / code `SB24` (ref by req9.owner)
  - sales25@demo.abuts.fit / `Sa!1111111` / code `SB25` (ref by req10.owner)
  - sales26@demo.abuts.fit / `Sa!1111111` / code `SB26` (ref by req11.owner)
  - sales27@demo.abuts.fit / `Sa!1111111` / code `SB27` (ref by req12.owner)
  - sales28@demo.abuts.fit / `Sa!1111111` / code `SB28` (ref by req13.owner)
  - sales29@demo.abuts.fit / `Sa!1111111` / code `SB29` (ref by req14.owner)
  - sales30@demo.abuts.fit / `Sa!1111111` / code `SB30` (ref by req15.owner)
