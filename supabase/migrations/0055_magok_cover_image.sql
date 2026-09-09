-- ---------------------------------------------------------------------------
-- 0055: 마곡리빙마켓 메인 포스터.
--
-- exhibition.cover_image_url이 비어 있어 전시 홈 히어로와 전시 카드가
-- 그림 없이 떴다. 주최가 배포한 공식 포스터를 그대로 쓴다
-- (public/booths/magok-livingmarket-2026/livingmarket_poster.png, 904×1206).
--
-- 파일을 public/에 두고 경로만 넣는다 — 외부 CDN은 URL이 만료되거나 막히면
-- 조용히 빈칸이 된다(인스타 이미지에서 겪은 그대로).
-- ---------------------------------------------------------------------------

update exhibition
   set cover_image_url = '/booths/magok-livingmarket-2026/livingmarket_poster.png'
 where slug = 'magok-livingmarket-2026';
