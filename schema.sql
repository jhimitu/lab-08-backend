DROP TABLE IF EXISTS location;
CREATE TABLE location (
  latitude DECIMAL,
  longitude DECIMAL,
  formatted_query VARCHAR(255),
  search_query VARCHAR(255)
);