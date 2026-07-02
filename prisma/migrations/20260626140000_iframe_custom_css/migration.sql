ALTER TABLE `LoyaltySetting`
ADD COLUMN `iframeCustomCss` TEXT NULL;

UPDATE `LoyaltySetting`
SET `iframeCustomCss` = ''
WHERE `iframeCustomCss` IS NULL;

ALTER TABLE `LoyaltySetting`
MODIFY COLUMN `iframeCustomCss` TEXT NOT NULL;
