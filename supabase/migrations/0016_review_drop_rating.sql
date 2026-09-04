-- 리뷰에서 별점 제거. 도서전 부스에 1~5 별점은 의미가 약하고, 리뷰는
-- 한줄 후기(코멘트) 중심으로 단순화한다. 멱등.
alter table review drop column if exists rating;
