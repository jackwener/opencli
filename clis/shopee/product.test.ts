import { describe, expect, it } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './product.js';

const {
  PRODUCT_COLUMNS,
  PRODUCT_FIELDS,
  mergeProductDetails,
  hasMeaningfulProductData,
} =
  await import('./product.js').then((m) => (m as typeof import('./product.js')).__test__);

describe('shopee product adapter', () => {
  const command = getRegistry().get('shopee/product');

  it('registers the command with correct shape', () => {
    expect(command).toBeDefined();
    expect(command!.site).toBe('shopee');
    expect(command!.name).toBe('product');
    expect(command!.domain).toBe('shopee.sg');
    expect(command!.strategy).toBe('cookie');
    expect(command!.navigateBefore).toBe(false);
    expect(typeof command!.func).toBe('function');
  });

  it('has url as a required positional arg', () => {
    const urlArg = command!.args.find((arg) => arg.name === 'url');
    expect(urlArg).toBeDefined();
    expect(urlArg!.required).toBe(true);
    expect(urlArg!.positional).toBe(true);
  });

  it('includes key product fields in the output columns', () => {
    expect(PRODUCT_COLUMNS).toEqual(
      expect.arrayContaining([
        'product_url',
        'title',
        'rating_score',
        'current_price_range',
        'shopee_price',
        'shopdora_price',
        'main_image_url',
        'video_url',
        'thumbnail_url',
        'attr_options',
        'spec_options',
        'seller_name',
        'shop_name',
        'shop_url',
        'shop_product_list_url',
        'stock',
      ]),
    );
    expect(command!.columns).toEqual(expect.arrayContaining(PRODUCT_COLUMNS));
  });

  it('marks structured template fields with list metadata', () => {
    const videoField = PRODUCT_FIELDS.find((field) => field.name === 'video_url');
    const thumbnailField = PRODUCT_FIELDS.find((field) => field.name === 'thumbnail_url');
    const attrOptionsField = PRODUCT_FIELDS.find((field) => field.name === 'attr_options');
    const specOptionsField = PRODUCT_FIELDS.find((field) => field.name === 'spec_options');

    expect(videoField).toMatchObject({
      type: 'list',
      fields: [
        { name: 'video_url', type: 'attribute', attribute: 'src', transform: 'absolute_url' },
      ],
    });
    expect(thumbnailField).toMatchObject({
      type: 'list',
      fields: [{ name: 'thumbnail_url', type: 'attribute', attribute: 'src' }],
    });
    expect(attrOptionsField).toMatchObject({
      type: 'list',
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'image_url', type: 'attribute', attribute: 'src' }),
        expect.objectContaining({ name: 'is_selected', transform: 'selected_class' }),
      ]),
    });
    expect(specOptionsField).toMatchObject({
      type: 'list',
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'is_selected', transform: 'selected_class' }),
      ]),
    });
  });
});

describe('mergeProductDetails', () => {
  it('fills only missing fields from a later extraction pass', () => {
    expect(
      mergeProductDetails(
        { title: 'Product A', seller_name: '', stock: '' },
        { title: 'Product B', seller_name: 'Shop 1', stock: '99' },
      ),
    ).toEqual({
      title: 'Product A',
      seller_name: 'Shop 1',
      stock: '99',
    });
  });
});

describe('hasMeaningfulProductData', () => {
  it('returns false for empty extraction rows', () => {
    expect(hasMeaningfulProductData({ title: '', seller_name: '' })).toBe(false);
  });

  it('returns true once any mapped product field has content', () => {
    expect(hasMeaningfulProductData({ title: 'Wireless Earbuds' })).toBe(true);
  });
});
