ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TENANT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LANDLORD';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PROPERTY_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEVELOPER';
ALTER TYPE "ListingType" ADD VALUE IF NOT EXISTS 'SHORT_TERM_RENT';
ALTER TYPE "ListingType" ADD VALUE IF NOT EXISTS 'LONG_TERM_RENT';
ALTER TYPE "ListingType" ADD VALUE IF NOT EXISTS 'LEASE';

CREATE TYPE "MeasurementUnit" AS ENUM ('SQUARE_METERS', 'SQUARE_FEET', 'ACRES', 'HECTARES');
CREATE TYPE "UserVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED');

CREATE TABLE "Currency" (
	"code" VARCHAR(3) NOT NULL,
	"name" TEXT NOT NULL,
	"minorUnits" INTEGER NOT NULL DEFAULT 2,
	CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);
INSERT INTO "Currency" ("code", "name", "minorUnits") VALUES
	('NGN', 'Nigerian naira', 2),
	('USD', 'United States dollar', 2),
	('EUR', 'Euro', 2),
	('GBP', 'British pound', 2),
	('CAD', 'Canadian dollar', 2),
	('AUD', 'Australian dollar', 2),
	('AED', 'UAE dirham', 2),
	('ZAR', 'South African rand', 2),
	('JPY', 'Japanese yen', 0),
	('CHF', 'Swiss franc', 2)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Currency" ("code", "name") SELECT DISTINCT upper("currency"), upper("currency") FROM "Payment"
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "Country" (
	"code" VARCHAR(2) NOT NULL,
	"name" TEXT NOT NULL,
	"nativeCurrencyCode" VARCHAR(3),
	CONSTRAINT "Country_pkey" PRIMARY KEY ("code"),
	CONSTRAINT "Country_nativeCurrencyCode_fkey" FOREIGN KEY ("nativeCurrencyCode") REFERENCES "Currency"("code") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "Country" ("code", "name", "nativeCurrencyCode") VALUES ('NG', 'Nigeria', 'NGN')
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "Region" (
	"id" TEXT NOT NULL,
	"countryCode" VARCHAR(2) NOT NULL,
	"name" TEXT NOT NULL,
	"code" TEXT,
	CONSTRAINT "Region_pkey" PRIMARY KEY ("id"),
	CONSTRAINT "Region_countryCode_name_key" UNIQUE ("countryCode", "name"),
	CONSTRAINT "Region_countryCode_code_key" UNIQUE ("countryCode", "code"),
	CONSTRAINT "Region_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Region" ("id", "countryCode", "name")
SELECT 'region-ng-' || row_number() OVER (ORDER BY state_name)::TEXT, 'NG', state_name
FROM (
	SELECT DISTINCT trim("state") AS state_name FROM "Location" WHERE lower(trim("country")) = 'nigeria'
	UNION
	SELECT DISTINCT trim("state") AS state_name FROM "Profile" WHERE lower(trim("country")) = 'nigeria' AND "state" IS NOT NULL AND trim("state") <> ''
) AS legacy_regions
ON CONFLICT ("countryCode", "name") DO NOTHING;

CREATE TABLE "City" (
	"id" TEXT NOT NULL,
	"countryCode" VARCHAR(2) NOT NULL,
	"regionId" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	CONSTRAINT "City_pkey" PRIMARY KEY ("id"),
	CONSTRAINT "City_regionId_name_key" UNIQUE ("regionId", "name"),
	CONSTRAINT "City_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "City" ("id", "countryCode", "regionId", "name")
SELECT 'city-ng-' || row_number() OVER (ORDER BY legacy_cities.region_name, legacy_cities.city_name)::TEXT,
	   'NG', region."id", legacy_cities.city_name
FROM (
	SELECT DISTINCT trim("state") AS region_name, trim("city") AS city_name FROM "Location" WHERE lower(trim("country")) = 'nigeria'
	UNION
	SELECT DISTINCT trim("state") AS region_name, trim("city") AS city_name FROM "Profile" WHERE lower(trim("country")) = 'nigeria' AND "state" IS NOT NULL AND trim("state") <> '' AND "city" IS NOT NULL AND trim("city") <> ''
) AS legacy_cities
JOIN "Region" AS region ON region."countryCode" = 'NG' AND region."name" = legacy_cities.region_name
ON CONFLICT ("regionId", "name") DO NOTHING;

CREATE TABLE "PropertyType" (
	"id" TEXT NOT NULL,
	"code" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	CONSTRAINT "PropertyType_pkey" PRIMARY KEY ("id"),
	CONSTRAINT "PropertyType_code_key" UNIQUE ("code")
);
INSERT INTO "PropertyType" ("id", "code", "name")
SELECT 'property-type-' || lower(regexp_replace(trim("type"), '[^a-zA-Z0-9]+', '-', 'g')),
	   lower(regexp_replace(trim("type"), '[^a-zA-Z0-9]+', '-', 'g')),
	   trim("type")
FROM "Property"
GROUP BY trim("type")
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "Location"
	ADD COLUMN "postalCode" TEXT,
	ADD COLUMN "countryCode" VARCHAR(2),
	ADD COLUMN "regionId" TEXT,
	ADD COLUMN "cityId" TEXT,
	ADD COLUMN "hideExactAddress" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Location" AS location
SET "countryCode" = 'NG',
	"regionId" = region."id",
	"cityId" = city."id"
FROM "Region" AS region
JOIN "City" AS city ON city."regionId" = region."id"
WHERE region."countryCode" = 'NG'
	AND lower(trim(location."country")) = 'nigeria'
  AND region."name" = trim(location."state")
  AND city."name" = trim(location."city");

ALTER TABLE "User"
	ADD COLUMN "countryCode" VARCHAR(2),
	ADD COLUMN "regionId" TEXT,
	ADD COLUMN "cityId" TEXT,
	ADD COLUMN "preferredCurrency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
	ADD COLUMN "preferredLanguage" VARCHAR(12) NOT NULL DEFAULT 'en',
	ADD COLUMN "measurementUnit" "MeasurementUnit" NOT NULL DEFAULT 'SQUARE_METERS',
	ADD COLUMN "timeZone" VARCHAR(80),
	ADD COLUMN "verificationStatus" "UserVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';
UPDATE "User" AS account
SET "countryCode" = 'NG', "regionId" = region."id", "cityId" = city."id"
FROM "Profile" AS profile
JOIN "Region" AS region ON region."countryCode" = 'NG' AND region."name" = trim(profile."state")
JOIN "City" AS city ON city."regionId" = region."id" AND city."name" = trim(profile."city")
WHERE profile."userId" = account."id"
	AND lower(trim(profile."country")) = 'nigeria'
	AND profile."state" IS NOT NULL
	AND profile."city" IS NOT NULL;

ALTER TABLE "Property"
	ADD COLUMN "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'NGN',
	ADD COLUMN "propertyTypeId" TEXT,
	ADD COLUMN "sizeUnit" "MeasurementUnit" NOT NULL DEFAULT 'SQUARE_METERS',
	ADD COLUMN "furnished" BOOLEAN,
	ADD COLUMN "parkingSpaces" INTEGER,
	ADD COLUMN "hasPool" BOOLEAN NOT NULL DEFAULT false,
	ADD COLUMN "hasSecurity" BOOLEAN NOT NULL DEFAULT false,
	ADD COLUMN "luxury" BOOLEAN NOT NULL DEFAULT false,
	ADD COLUMN "yearBuilt" INTEGER;
ALTER TABLE "Property" ALTER COLUMN "size" TYPE DECIMAL(14, 2) USING "size"::DECIMAL(14, 2);
UPDATE "Property" AS property
SET "propertyTypeId" = property_type."id"
FROM "PropertyType" AS property_type
WHERE lower(property_type."name") = lower(property."type");

ALTER TABLE "Payment"
	ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
	ADD COLUMN "providerReference" TEXT;

ALTER TABLE "Location"
	ADD CONSTRAINT "Location_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE SET NULL ON UPDATE CASCADE,
	ADD CONSTRAINT "Location_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE,
	ADD CONSTRAINT "Location_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User"
	ADD CONSTRAINT "User_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE SET NULL ON UPDATE CASCADE,
	ADD CONSTRAINT "User_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE,
	ADD CONSTRAINT "User_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE,
	ADD CONSTRAINT "User_preferredCurrency_fkey" FOREIGN KEY ("preferredCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Property"
	ADD CONSTRAINT "Property_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
	ADD CONSTRAINT "Property_propertyTypeId_fkey" FOREIGN KEY ("propertyTypeId") REFERENCES "PropertyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment"
	ADD CONSTRAINT "Payment_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Region_countryCode_idx" ON "Region"("countryCode");
CREATE INDEX "City_countryCode_name_idx" ON "City"("countryCode", "name");
CREATE INDEX "Country_name_idx" ON "Country"("name");
CREATE INDEX "Currency_name_idx" ON "Currency"("name");
CREATE INDEX "Location_countryCode_regionId_cityId_idx" ON "Location"("countryCode", "regionId", "cityId");
CREATE INDEX "Location_latitude_longitude_idx" ON "Location"("latitude", "longitude");
CREATE INDEX "User_countryCode_regionId_cityId_idx" ON "User"("countryCode", "regionId", "cityId");
CREATE INDEX "Property_currencyCode_price_idx" ON "Property"("currencyCode", "price");
CREATE INDEX "Property_propertyTypeId_idx" ON "Property"("propertyTypeId");
CREATE INDEX "Property_status_listingType_createdAt_idx" ON "Property"("status", "listingType", "createdAt");
CREATE INDEX "Property_status_luxury_createdAt_idx" ON "Property"("status", "luxury", "createdAt");
CREATE INDEX "Property_sizeUnit_size_idx" ON "Property"("sizeUnit", "size");
CREATE INDEX "Property_bedrooms_bathrooms_idx" ON "Property"("bedrooms", "bathrooms");
CREATE INDEX "Property_yearBuilt_idx" ON "Property"("yearBuilt");
CREATE INDEX "Property_furnished_hasPool_hasSecurity_idx" ON "Property"("furnished", "hasPool", "hasSecurity");
